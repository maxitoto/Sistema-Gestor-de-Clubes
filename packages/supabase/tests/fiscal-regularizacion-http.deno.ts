import { ResolverAnulacionUseCase } from "../functions/_shared/modules/fiscal/application/ResolverAnulacionUseCase.ts";
import { ArcaConfiguracionError } from "../functions/_shared/modules/fiscal/infrastructure/configuracion-arca.ts";
import {
  actor,
  contexto,
  ejecucion,
  fake,
} from "./fixtures/fiscal-regularizacion-fixture.ts";
// deno-lint-ignore-file require-await
// Los dobles conservan puertos Promise sin inventar operaciones de I/O.
import { crearAppMonitoreo } from "../functions/monitoreo/app.ts";
import {
  crearAppFiscalWorker,
  validarSecretoFiscal,
} from "../functions/fiscal-worker/app.ts";
import { AppError } from "@core/index.ts";
const id = "60000000-0000-0000-0000-000000000001",
  secret = "secreto-sintetico-fiscal-exclusivo-de-pruebas-2026";
function assert(value: unknown) {
  if (!value) throw new Error("La condición no se cumple");
}
function req(path: string, method = "POST", body?: unknown, header?: string) {
  return new Request("http://localhost" + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(header ? { "x-fiscal-worker-secret": header } : {}),
    },
    ...(body === undefined
      ? {}
      : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}
Deno.test("worker secreto insuficiente o compartido falla", () => {
  for (const value of [undefined, "corto", secret]) {
    let failed = false;
    try {
      validarSecretoFiscal({
        get: (n) =>
          n === "FISCAL_WORKER_SECRET"
            ? value
            : n === "MAIL_WORKER_SECRET"
            ? secret
            : undefined,
      });
    } catch {
      failed = true;
    }
    assert(failed);
  }
});
Deno.test("worker secreto independiente válido", () =>
  assert(
    validarSecretoFiscal({
      get: (n) => n === "FISCAL_WORKER_SECRET" ? secret : undefined,
    }) === secret,
  ));
Deno.test("worker método 405 antes de negocio", async () => {
  let calls = 0;
  const app = crearAppFiscalWorker({
    secreto: secret,
    procesar: async () => {
      calls++;
      return { http: 200, body: {} };
    },
  });
  assert(
    (await app.fetch(req("/fiscal-worker/procesar-pendientes", "GET")))
      .status === 405,
  );
  assert(calls === 0);
});
for (const h of [undefined, "inválido"]) {
  Deno.test("worker 401 " + String(h), async () => {
    let calls = 0;
    const app = crearAppFiscalWorker({
      secreto: secret,
      procesar: async () => {
        calls++;
        return { http: 200, body: {} };
      },
    });
    assert(
      (await app.fetch(
        req("/fiscal-worker/procesar-pendientes", "POST", undefined, h),
      )).status === 401,
    );
    assert(calls === 0);
  });
}
Deno.test("worker JWT humano no sustituye secreto", async () => {
  let called = false;
  const app = crearAppFiscalWorker({
    secreto: secret,
    procesar: async () => {
      called = true;
      return { http: 200, body: {} };
    },
  });
  const r = req("/fiscal-worker/procesar-pendientes");
  r.headers.set("Authorization", "Bearer jwt-sintetico");
  assert((await app.fetch(r)).status === 401);
  assert(!called);
});
for (const body of [" ", {}, { actor: id }, "noJSON"]) {
  Deno.test("worker cuerpo 400 " + JSON.stringify(body), async () => {
    let called = false;
    const app = crearAppFiscalWorker({
      secreto: secret,
      procesar: async () => {
        called = true;
        return { http: 200, body: {} };
      },
    });
    assert(
      (await app.fetch(
        req("/fiscal-worker/procesar-pendientes", "POST", body, secret),
      )).status === 400,
    );
    assert(!called);
  });
}
Deno.test("worker secreto sin JWT y lote vacío 200", async () => {
  let called = 0;
  const app = crearAppFiscalWorker({
    secreto: secret,
    procesar: async () => {
      called++;
      return {
        http: 200,
        body: { ejecucionId: id, evaluados: 0, hayMas: false },
      };
    },
  });
  const result = await app.fetch(
    req(
      "/functions/v1/fiscal-worker/procesar-pendientes",
      "POST",
      undefined,
      secret,
    ),
  );
  assert(result.status === 200 && called === 1);
  assert((await result.json()).evaluados === 0);
});
Deno.test("worker error 503 saneado y referencia", async () => {
  const app = crearAppFiscalWorker({
    secreto: secret,
    uuid: () => id,
    procesar: async () => {
      throw new Error("TOKEN PRIVADO");
    },
  });
  const result = await app.fetch(
    req("/fiscal-worker/procesar-pendientes", "POST", undefined, secret),
  );
  const text = await result.text();
  assert(result.status === 503 && !text.includes("TOKEN") && text.includes(id));
});
Deno.test("monitoreo autoriza antes de cuerpo y negocio", async () => {
  let calls = 0;
  const app = crearAppMonitoreo({
    autorizar: async () => {
      throw new AppError("Sin identidad", 401);
    },
    listar: async () => {
      calls++;
      return {};
    },
    accion: async () => {
      calls++;
      return { resultado: "reabierto", advertencia: null };
    },
  });
  assert(
    (await app.fetch(req("/monitoreo/reabrir", "POST", "malJSON"))).status ===
        401 && calls === 0,
  );
});
Deno.test("monitoreo lectura valida filtros y llama mismo DTO", async () => {
  let mode = "", calls = 0;
  const app = crearAppMonitoreo({
    autorizar: async (_c, m) => {
      mode = m;
    },
    listar: async (_c, q) => {
      calls++;
      assert(q.page === 2 && q.pageSize === 50 && q.estado === "fallido");
      return { items: [], total: 0 };
    },
    accion: async () => ({ resultado: "bloqueado", advertencia: null }),
  });
  assert(
    (await app.fetch(
      req("/monitoreo?page=2&pageSize=50&estado=fallido", "GET"),
    )).status === 200,
  );
  assert(mode === "lectura" && calls === 1);
});
for (
  const q of [
    "page=0",
    "pageSize=1",
    "estado=valido",
    "tipo=otro",
    "desde=2026-02-30",
    "desde=2026-10-26&hasta=2026-10-25",
    "actor=x",
    "page=1&page=2",
  ]
) {
  Deno.test("monitoreo filtros 400 " + q, async () => {
    let calls = 0;
    const app = crearAppMonitoreo({
      autorizar: async () => {},
      listar: async () => {
        calls++;
        return {};
      },
      accion: async () => ({ resultado: "bloqueado", advertencia: null }),
    });
    assert(
      (await app.fetch(req("/monitoreo?" + q, "GET"))).status === 400 &&
        calls === 0,
    );
  });
}
for (const action of ["forzar", "reabrir", "resolver", "registrar-externo"]) {
  Deno.test("acción " + action + " sólo admin DTO cerrado", async () => {
    let calls = 0, mode = "";
    const app = crearAppMonitoreo({
      autorizar: async (_c, m) => {
        mode = m;
      },
      listar: async () => ({}),
      accion: async (_c, n, cid) => {
        assert(n === action && cid === id);
        calls++;
        return { resultado: "pendiente", advertencia: null };
      },
    });
    assert(
      (await app.fetch(
        req("/monitoreo/" + action, "POST", { comprobanteId: id, monto: 1 }),
      )).status === 400,
    );
    assert(
      (await app.fetch(
        req("/monitoreo/" + action, "POST", { comprobanteId: id }),
      )).status === 200,
    );
    assert(calls === 1 && mode === "admin");
  });
}
Deno.test("Responsable consulta pero no fuerza", async () => {
  const app = crearAppMonitoreo({
    autorizar: async (_c, m) => {
      if (m === "admin") throw new AppError("Sin permiso", 403);
    },
    listar: async () => ({ items: [] }),
    accion: async () => {
      throw new Error("Nunca");
    },
  });
  assert(
    (await app.fetch(req("/monitoreo/forzar", "POST", { comprobanteId: id })))
      .status === 403,
  );
  assert((await app.fetch(req("/monitoreo", "GET"))).status === 200);
});

for (const localSeguro of [true, false]) {
  Deno.test("resolver HTTP sin ARCA localSeguro=" + localSeguro, async () => {
    const c = contexto();
    c.ejecucion = ejecucion(c);
    c.pago.estado = "anulado";
    c.comprobante.estado_fiscal = "anulacion_pendiente";
    const f = fake(c);
    let ports = 0;
    f.repo.resolverSinEnvio = async () => ({ resuelto: localSeguro });
    const app = crearAppMonitoreo({
      autorizar: async () => {},
      listar: async () => ({}),
      accion: async (_c, nombre, cid) => {
        assert(nombre === "resolver");
        const out = await new ResolverAnulacionUseCase(f.repo, () => {
          ports++;
          throw new ArcaConfiguracionError("DETALLE PRIVADO");
        }).ejecutar(cid, actor);
        return { resultado: out.resultado, advertencia: out.advertencia };
      },
    });
    const response = await app.fetch(
      req("/monitoreo/resolver", "POST", { comprobanteId: id }),
    );
    const text = await response.text();
    assert(response.status === (localSeguro ? 200 : 503));
    assert(ports === (localSeguro ? 0 : 1));
    assert(!text.includes("DETALLE PRIVADO"));
    assert(
      localSeguro
        ? text.includes("resuelto")
        : text.includes("ARCA_CONFIGURACION_PENDIENTE"),
    );
    assert(!f.calls.includes("iniciar:conciliacion"));
  });
}
