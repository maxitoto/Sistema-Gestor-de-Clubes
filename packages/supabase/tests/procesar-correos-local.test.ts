import { describe, expect, test } from "bun:test";
import { leerConfiguracionLocal } from "../scripts/procesar-correos-local.ts";

// Sólo se valida configuración sintética; no se inicia el worker ni se usa red.
const entornoSintetico = {
  MAIL_PROVIDER: "mailpit",
  MAIL_WORKER_SECRET: "secreto_sintetico_exclusivo_de_prueba_1234567890",
};

describe("destino local del procesador de correos", () => {
  test("acepta API local en loopback", () => {
    const config = leerConfiguracionLocal({
      ...entornoSintetico,
      MAIL_PUBLIC_BASE_URL: "http://127.0.0.1:54321/functions/v1/comunicaciones",
    });
    expect(config.endpoint.href).toBe(
      "http://127.0.0.1:54321/functions/v1/comunicaciones/procesar-cola",
    );
  });

  test("rechaza destinos externos o rutas distintas antes de procesar", () => {
    expect(() => leerConfiguracionLocal({
      ...entornoSintetico,
      MAIL_PUBLIC_BASE_URL: "https://externo.invalid/functions/v1/comunicaciones",
    })).toThrow("/functions/v1/comunicaciones");
  });
});
