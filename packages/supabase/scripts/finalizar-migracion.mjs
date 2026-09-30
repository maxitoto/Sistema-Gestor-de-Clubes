import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const begin = '-- BEGIN ACL FINALES DESDE 5_POLITICS';
const end = '-- END ACL FINALES DESDE 5_POLITICS';

// Sólo prepara archivos: nunca conecta a la base ni ejecuta ni resetea migraciones.
export async function finalizar(root, mode, filename, now = new Date()) {
  await readFile(join(root, 'config.toml'), 'utf8');
  const source = (await readFile(join(root, 'schemas', '5_politics.sql'), 'utf8'))
    .replace(/\r\n/g, '\n');
  const block = source.match(
    /^-- 10\. Permisos efectivos:[^\n]*\n([\s\S]*?)^-- 11\. Recarga de la cache de PostgREST\./m,
  )?.[1]?.trim();
  if (!block) throw new Error('No se encontró la sección 10 de permisos en 5_politics.sql.');
  const statements = block.replace(/^\s*--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
  if (!statements.length || statements.some(s => !/^(GRANT|REVOKE)\b/i.test(s))) {
    throw new Error('La sección 10 debe contener sólo GRANT/REVOKE.');
  }
  const firstGrant = statements.findIndex(s => /^GRANT\b/i.test(s));
  if (firstGrant < 1 || statements.slice(firstGrant).some(s => /^REVOKE\b/i.test(s))) {
    throw new Error('La fuente debe contener todas las revocaciones antes de las concesiones.');
  }

  const directory = join(root, 'migrations');
  const files = (await readdir(directory)).filter(name => /^\d{14}_.+\.sql$/.test(name));
  const footer = `${begin}\n` +
    '-- Generado desde schemas/5_politics.sql; editar la fuente, no esta copia.\n' +
    'DROP POLICY IF EXISTS club_delete_admin ON public.club;\n\n' +
    `${block}\n\nNOTIFY pgrst, 'reload schema';\n${end}\n`;

  if (mode === '--correccion') {
    if (filename) throw new Error('--correccion no recibe un nombre de archivo.');
    const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    if (files.some(name => name.slice(0, 14) >= stamp)) {
      throw new Error('La nueva versión debe ser posterior a todas las migraciones existentes. Revise el reloj/historial.');
    }
    const target = join(directory, `${stamp}_correccion_permisos.sql`);
    await writeFile(target, footer, { encoding: 'utf8', flag: 'wx' });
    return target;
  }
  if (mode !== '--completar' || !filename || !/^\d{14}_[A-Za-z0-9_-]+\.sql$/.test(filename)) {
    throw new Error('Uso: bun scripts/finalizar-migracion.mjs --completar <archivo.sql> | --correccion');
  }
  // El nombre debe ser un archivo de migrations/, nunca una ruta externa.
  const target = join(directory, filename);
  let migration = (await readFile(target, 'utf8')).replace(/\r\n/g, '\n');
  const startAt = migration.indexOf(begin);
  const endAt = migration.indexOf(end);
  if (startAt !== -1 || endAt !== -1) {
    if (startAt < 0 || endAt < startAt ||
        migration.indexOf(begin, startAt + begin.length) !== -1 ||
        migration.indexOf(end, endAt + end.length) !== -1 ||
        migration.slice(endAt + end.length).trim() !== '') {
      throw new Error('El bloque automático existente está incompleto, duplicado o no está al final.');
    }
    migration = migration.slice(0, startAt);
  }
  await writeFile(target, `${migration.trimEnd()}\n\n${footer}`, 'utf8');
  return target;
}

if (import.meta.main) {
  try {
    if (process.argv.length < 3 || process.argv.length > 4) {
      throw new Error('Uso: bun scripts/finalizar-migracion.mjs --completar <archivo.sql> | --correccion');
    }
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const result = await finalizar(root, process.argv[2], process.argv[3]);
    console.log(`SQL preparado: ${result}`);
    console.log('No se ejecutó SQL. --completar es sólo para archivos aún no aplicados; --correccion crea una migración nueva.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'No se pudo preparar la migración.');
    process.exitCode = 1;
  }
}
