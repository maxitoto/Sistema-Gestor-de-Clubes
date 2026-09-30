import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// La CLI busca <workdir>/supabase/config.toml: en este monorepo es packages/.
const processTypes = Bun.spawn(
	[
		process.execPath,
		'x',
		'supabase',
		'gen',
		'types',
		'typescript',
		'--local',
		'--workdir',
		resolve(frontend, '..'),
	],
	{
		cwd: frontend,
		stdout: 'pipe',
		stderr: 'inherit',
	},
);
const generated = await new Response(processTypes.stdout).text();
if ((await processTypes.exited) !== 0 || !generated.includes('export type Database')) {
	throw new Error(
		'No se generaron los tipos. Se conserva el archivo anterior. Verifique que Supabase local esté iniciado.',
	);
}
const destination = resolve(frontend, 'src/shared/types/model.ts');
const temporary = `${destination}.${process.pid}.tmp`;
await mkdir(dirname(destination), { recursive: true });
try {
	await writeFile(temporary, generated, 'utf8');
	await rename(temporary, destination);
} finally {
	await rm(temporary, { force: true });
}
