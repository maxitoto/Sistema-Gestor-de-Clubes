import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Resolver desde el archivo evita depender de dónde se lanzó el comando.
export function configuracionFuncionesLocales(scriptUrl = import.meta.url) {
  const backend = fileURLToPath(new URL("../", scriptUrl));
  return {
    backend,
    workdir: resolve(backend, ".."),
    config: resolve(backend, "config.toml"),
    envFile: resolve(backend, "functions", ".env"),
  };
}

if (import.meta.main) {
  try {
    const { backend, workdir, config, envFile } = configuracionFuncionesLocales();
    if (!existsSync(config)) {
      throw new Error("No se encontró packages/supabase/config.toml.");
    }
    if (!existsSync(envFile)) {
      throw new Error(
        "Creá functions/.env a partir de functions/.env.example y completá los secretos locales.",
      );
    }
    const child = Bun.spawn(
      [process.execPath, "x", "supabase", "functions", "serve", "--workdir", workdir, "--env-file", envFile],
      { cwd: backend, stdin: "inherit", stdout: "inherit", stderr: "inherit" },
    );
    process.exitCode = await child.exited;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "No se pudieron iniciar las funciones locales.");
    process.exitCode = 1;
  }
}
