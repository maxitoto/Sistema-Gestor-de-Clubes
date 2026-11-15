import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

export type RolCuentaPrueba = "admin" | "responsable" | "inactivo";

export interface CuentaPrueba {
  kind: RolCuentaPrueba;
  id: string;
  email: string;
  password: string;
  temporal: boolean;
}

export interface EstadoLocalSupabase {
  API_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
  MAILPIT_URL: string;
}

export const PROJECT_ID = "sistema-club-los-andes";
export const DB_CONTAINER = `supabase_db_${PROJECT_ID}`;
export const API_URL_ESPERADA = "http://127.0.0.1:54321";
export const MAILPIT_URL_ESPERADA = "http://127.0.0.1:54324";
export const DB_PORT_ESPERADO = "54322";

function crcPng(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function chunkPng(name: string, data: Uint8Array): Buffer {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  result.write(name, 4);
  result.set(data, 8);
  result.writeUInt32BE(
    crcPng(result.subarray(4, result.length - 4)),
    result.length - 4,
  );
  return result;
}

// PNG válido de 1x1 píxel con CRC e inflado verificados por validarBytes.
export const PNG_1X1_BYTES = (() => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunkPng("IHDR", header),
      chunkPng("IDAT", deflateSync(Buffer.from([0, 37, 99, 235, 255]))),
      chunkPng("IEND", Buffer.alloc(0)),
    ]),
  );
})();

export function resolverRutasRepositorio() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const backend = resolve(root, "packages/supabase");
  const cfg = Bun.TOML.parse(
    readFileSync(resolve(backend, "config.toml"), "utf8"),
  ) as {
    project_id?: string;
    api?: { port?: number };
    db?: { port?: number };
    local_smtp?: { port?: number };
    inbucket?: { port?: number };
  };
  if (
    cfg.project_id !== PROJECT_ID ||
    cfg.api?.port !== 54321 ||
    cfg.db?.port !== 54322 ||
    (cfg.local_smtp?.port ?? cfg.inbucket?.port) !== 54324
  ) {
    throw new Error(
      "Configuración local de Supabase no coincide con el proyecto esperado.",
    );
  }
  return { root, backend };
}

export function verificarContenedorDb(): void {
  const inspect = Bun.spawnSync(["docker", "inspect", DB_CONTAINER], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (inspect.exitCode !== 0) {
    throw new Error(`Contenedor ${DB_CONTAINER} inactivo o inexistente.`);
  }
  const meta = JSON.parse(inspect.stdout.toString())[0];
  const label = meta?.Config?.Labels?.["com.supabase.cli.project"];
  const ports = meta?.NetworkSettings?.Ports?.["5432/tcp"] ?? [];
  if (
    !meta?.State?.Running ||
    label !== PROJECT_ID ||
    !ports.length ||
    !ports.every(
      (p: { HostPort?: string }) => p.HostPort === DB_PORT_ESPERADO,
    )
  ) {
    throw new Error(
      "El contenedor de base de datos local no corresponde al proyecto esperado.",
    );
  }
}

export function ejecutarSqlLocal(sql: string, database = "postgres"): string {
  const proc = Bun.spawnSync(
    [
      "docker",
      "exec",
      "-i",
      DB_CONTAINER,
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      database,
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      stdin: Buffer.from(sql),
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  if (proc.exitCode !== 0) {
    throw new Error(
      `La consulta SQL local falló: ${proc.stderr.toString().slice(-600)}`,
    );
  }
  return proc.stdout.toString().trim();
}

export function literalSql(valor: string): string {
  return `'${valor.replaceAll("'", "''")}'`;
}

export function leerVariablesEntornoFunciones(
  backend: string,
): Record<string, string> {
  const contenido = readFileSync(resolve(backend, "functions/.env"), "utf8");
  return Object.fromEntries(
    contenido
      .split(/\r?\n/)
      .filter((linea) => linea.includes("=") && !linea.trimStart().startsWith("#"))
      .map((linea) => {
        const idx = linea.indexOf("=");
        return [
          linea.slice(0, idx).trim(),
          linea
            .slice(idx + 1)
            .trim()
            .replace(/^["']|["']$/g, ""),
        ];
      }),
  );
}

export function obtenerEstadoSupabase(backend: string): EstadoLocalSupabase {
  verificarContenedorDb();
  const proc = Bun.spawnSync(
    ["bunx", "supabase", "status", "--workdir", "..", "-o", "json"],
    {
      cwd: backend,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  if (proc.exitCode !== 0) {
    throw new Error(
      `No se pudo obtener el estado de Supabase local: ${proc.stderr.toString()}`,
    );
  }
  const stdout = proc.stdout.toString();
  const startIdx = stdout.indexOf("{");
  const endIdx = stdout.lastIndexOf("}");
  if (startIdx < 0 || endIdx < startIdx) {
    throw new Error("Salida JSON de supabase status inválida.");
  }
  const parsed = JSON.parse(stdout.slice(startIdx, endIdx + 1)) as Record<
    string,
    string
  >;
  const API_URL = parsed.API_URL ?? "";
  const ANON_KEY = parsed.ANON_KEY ?? "";
  const SERVICE_ROLE_KEY = parsed.SERVICE_ROLE_KEY ?? "";
  const MAILPIT_URL = parsed.MAILPIT_URL ?? MAILPIT_URL_ESPERADA;
  if (API_URL !== API_URL_ESPERADA || !ANON_KEY || !SERVICE_ROLE_KEY) {
    throw new Error("Estado de API o claves locales de Supabase inválido.");
  }
  return { API_URL, ANON_KEY, SERVICE_ROLE_KEY, MAILPIT_URL };
}

async function crearUsuarioAuthTemporal(
  status: EstadoLocalSupabase,
  email: string,
  password: string,
  nombre: string,
  apellido: string,
): Promise<string> {
  const res = await fetch(`${status.API_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: status.ANON_KEY,
      Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre, apellido },
    }),
  });
  const data = (await res.json()) as { id?: string };
  if (!res.ok || typeof data?.id !== "string") {
    throw new Error(`No se pudo crear cuenta de prueba (${email}): HTTP ${res.status}`);
  }
  return data.id;
}

export async function eliminarUsuarioAuth(
  status: EstadoLocalSupabase,
  userId: string,
): Promise<void> {
  const res = await fetch(`${status.API_URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: {
      apikey: status.ANON_KEY,
      Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) {
    ejecutarSqlLocal(
      `BEGIN; SET LOCAL session_replication_role = 'replica'; DELETE FROM public.usuarios WHERE id = ${literalSql(userId)}; DELETE FROM auth.users WHERE id = ${literalSql(userId)}; COMMIT;`,
    );
  }
}

export async function prepararCuentasPrueba(
  status: EstadoLocalSupabase,
  rolesRequeridos: RolCuentaPrueba[] = ["admin", "responsable", "inactivo"],
): Promise<{
  cuentas: AccountList;
  porRol: Record<RolCuentaPrueba, CuentaPrueba>;
  limpiar: () => Promise<void>;
}> {
  const inicioUtc = ejecutarSqlLocal("SELECT clock_timestamp()::text;");
  ejecutarSqlLocal(
    "DELETE FROM private.acceso_intentos WHERE tipo = 'login' AND creado_en > clock_timestamp() - interval '2 minutes';",
  );

  const adminId = ejecutarSqlLocal(
    "SELECT id::text FROM public.usuarios WHERE email = 'admin@clublosandes.com' AND rol = 'admin' AND estado = 'activo' LIMIT 1;",
  );
  if (!adminId) {
    throw new Error(
      "No se encontró la cuenta semilla activa admin@clublosandes.com.",
    );
  }

  const sufijo = crypto.randomUUID().slice(0, 8);
  const creadas: string[] = [];

  const admin: CuentaPrueba = {
    kind: "admin",
    id: adminId,
    email: "admin@clublosandes.com",
    password: "Pass1234",
    temporal: false,
  };

  let responsable: CuentaPrueba = {
    kind: "responsable",
    id: "",
    email: `responsable.prueba.${sufijo}@clublosandes.test`,
    password: `RespPrueba_${sufijo}_9!`,
    temporal: true,
  };

  if (rolesRequeridos.includes("responsable")) {
    const id = await crearUsuarioAuthTemporal(
      status,
      responsable.email,
      responsable.password,
      "Responsable",
      `Prueba ${sufijo}`,
    );
    creadas.push(id);
    responsable = { ...responsable, id };
  }

  let inactivo: CuentaPrueba = {
    kind: "inactivo",
    id: "",
    email: `inactivo.prueba.${sufijo}@clublosandes.test`,
    password: `InactPrueba_${sufijo}_9!`,
    temporal: true,
  };

  if (rolesRequeridos.includes("inactivo")) {
    const id = await crearUsuarioAuthTemporal(
      status,
      inactivo.email,
      inactivo.password,
      "Inactivo",
      `Prueba ${sufijo}`,
    );
    creadas.push(id);
    ejecutarSqlLocal(
      `UPDATE public.usuarios SET estado = 'inactivo' WHERE id = ${literalSql(id)};`,
    );
    inactivo = { ...inactivo, id };
  }

  const porRol: Record<RolCuentaPrueba, CuentaPrueba> = {
    admin,
    responsable,
    inactivo,
  };
  const cuentas = rolesRequeridos.map((r) => porRol[r]);

  const limpiar = async () => {
    for (const id of creadas) {
      try {
        await eliminarUsuarioAuth(status, id);
      } catch {
        // Ignorar errores de limpieza si el usuario ya fue eliminado.
      }
    }
    try {
      ejecutarSqlLocal(
        `DELETE FROM private.acceso_intentos WHERE tipo = 'login' AND creado_en >= ${literalSql(inicioUtc)}::timestamptz;`,
      );
    } catch {
      // Ignorar errores secundarios de limpieza.
    }
  };

  return { cuentas, porRol, limpiar };
}

type AccountList = CuentaPrueba[];
