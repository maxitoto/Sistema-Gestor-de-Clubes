const test = Deno.test;
function expect(actual: unknown) {
  return {
    toBe: (expected: unknown) => {
      if (actual !== expected) throw new Error("Valor distinto");
    },
    toEqual: (expected: unknown) => {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error("Resultado durable distinto");
      }
    },
    not: {
      toHaveProperty: (key: string) => {
        if (actual && typeof actual === "object" && key in actual) {
          throw new Error("Campo no permitido");
        }
      },
      toContain: (value: string) => {
        if (typeof actual === "string" && actual.includes(value)) {
          throw new Error("Detalle interno expuesto");
        }
      },
    },
  };
}
import type { SupabaseClient } from "@supabase/supabase-js";
import { RepositorioIntentosFiscalesSupabase } from "../functions/_shared/modules/fiscal/infrastructure/RepositorioIntentosFiscalesSupabase.ts";
import { RepositorioRegularizacionFiscalSupabase } from "../functions/_shared/modules/fiscal/infrastructure/RepositorioRegularizacionFiscalSupabase.ts";
import { actor, ejecucion } from "./fixtures/fiscal-regularizacion-fixture.ts";
function client(error: { code: string; message: string } | null = null) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { data: ejecucion(), error };
    },
  };
  return { db: db as unknown as SupabaseClient, calls };
}
test("worker conserva confirmación fiscal sin atribuir autor humano", async () => {
  const x = client();
  const actual = ejecucion();
  const result = await new RepositorioIntentosFiscalesSupabase(x.db).confirmar(
    actual.id,
    actual.version,
    { tipo: "transitorio", codigos: [] },
  );
  expect(x.calls[0].name).toBe("confirmar_resultado_fiscal");
  expect(x.calls[0].args).not.toHaveProperty("p_actor_id");
  expect(result).toEqual(actual);
});
test("confirmación humana conserva actor verificado y mismo resultado durable", async () => {
  const x = client();
  const actual = ejecucion();
  const result = await new RepositorioIntentosFiscalesSupabase(x.db, actor)
    .confirmar(actual.id, actual.version, { tipo: "transitorio", codigos: [] });
  expect(x.calls[0].name).toBe("confirmar_resultado_fiscal_con_actor");
  expect(x.calls[0].args.p_actor_id).toBe(actor);
  expect(x.calls[0].args.p_version).toBe(actual.version);
  expect(result).toEqual(actual);
});
test("regularización administrativa transmite el actor a la confirmación compartida", async () => {
  const x = client();
  const actual = ejecucion();
  await new RepositorioRegularizacionFiscalSupabase(x.db, actor).confirmar(
    actual.id,
    actual.version,
    { tipo: "transitorio", codigos: [] },
  );
  expect(x.calls[0].name).toBe("confirmar_resultado_fiscal_con_actor");
  expect(x.calls[0].args.p_actor_id).toBe(actor);
});
test("pérdida de permiso antes de confirmar devuelve 403 sin revelar error DB", async () => {
  const x = client({ code: "42501", message: "NO_REFLEJAR_BASE" }),
    actual = ejecucion();
  try {
    await new RepositorioIntentosFiscalesSupabase(x.db, actor).confirmar(
      actual.id,
      actual.version,
      { tipo: "transitorio", codigos: [] },
    );
    throw new Error("No rechazó");
  } catch (error) {
    expect((error as { statusCode: number }).statusCode).toBe(403);
    expect((error as Error).message).not.toContain("NO_REFLEJAR_BASE");
  }
});
