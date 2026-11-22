import {
  crearManejadorComunicaciones,
  type DependenciasComunicaciones,
} from "../functions/comunicaciones/app.ts";
import { AppError, firmarBaja } from "../functions/_shared/core/index.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
function assert(v: unknown, m = "Falló un contrato HTTP") {
  if (!v) throw new Error(m);
}
const id = "10000000-0000-0000-0000-000000000001",
  rv = "20000000-0000-0000-0000-000000000002",
  secret = "s".repeat(64),
  webhookSecret = "whsec_" + btoa("w".repeat(32));
type Row = Record<string, unknown>;
type RpcResult = { data: unknown; error: Record<string, unknown> | null };
function setup(
  options: {
    rpc?: (name: string, args: Row) => RpcResult | Promise<RpcResult>;
    rows?: Row[];
    envio?: Row;
    autorizar?: () => Promise<unknown>;
    adjunto?: DependenciasComunicaciones["adjunto"];
    enviar?: DependenciasComunicaciones["enviar"];
    urlBaja?: DependenciasComunicaciones["urlBaja"];
  } = {},
) {
  const calls: {
    rpc: string[];
    tecnico: number;
    send: number;
    prepare: number;
    select: string[];
  } = { rpc: [], tecnico: 0, send: 0, prepare: 0, select: [] };
  let now = 0;
  const fake = {
    rpc: async (name: string, args: Row) => {
      calls.rpc.push(name);
      return options.rpc
        ? await options.rpc(name, args)
        : { data: null, error: null };
    },
    from: (_table: string) => {
      const query = {
        select: (columns: string) => {
          calls.select.push(columns);
          return query;
        },
        eq: () => query,
        gte: () => query,
        lt: () => query,
        order: () => query,
        range: () => query,
        maybeSingle: async () => ({ data: options.envio ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({
            data: options.rows ?? [],
            error: null,
            count: options.rows?.length ?? 0,
          }).then(resolve),
      };
      return query;
    },
  };
  const db = fake as unknown as SupabaseClient;
  const deps: DependenciasComunicaciones = {
    autorizar: options.autorizar ?? (() => Promise.resolve()),
    humano: () => db,
    tecnico: () => {
      calls.tecnico++;
      return db;
    },
    env: (n) =>
      n === "RESEND_WEBHOOK_SECRET"
        ? webhookSecret
        : n === "MAIL_PUBLIC_BASE_URL"
        ? "http://127.0.0.1:54321/functions/v1/comunicaciones"
        : secret,
    ...(options.urlBaja ? { urlBaja: options.urlBaja } : {}),
    proveedor: () => "mailpit",
    enviar: async (message) => {
      calls.send++;
      if (options.enviar) return await options.enviar(message);
      return "message-local";
    },
    preparar: async () => {
      calls.prepare++;
    },
    adjunto: options.adjunto ?? (() => Promise.resolve(null)),
    ahora: () => now,
    esperar: (ms) => {
      now += ms;
      return Promise.resolve();
    },
  };
  return { handle: crearManejadorComunicaciones(deps), calls, deps };
}
function req(
  path: string,
  body?: string,
  headers: Record<string, string> = {},
  method = body === undefined ? "GET" : "POST",
) {
  return new Request("http://local.test/functions/v1/comunicaciones" + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body }),
  });
}
const workerHeaders = { "x-mail-worker-secret": secret };
Deno.test("worker sin secreto no selecciona ni prepara filas", async () => {
  const x = setup();
  assert((await x.handle(req("/procesar-cola", "{}"))).status === 401);
  assert(!x.calls.tecnico && !x.calls.prepare && !x.calls.send);
});
Deno.test("worker rechaza parámetros de negocio antes de DB", async () => {
  const x = setup();
  assert(
    (await x.handle(req("/procesar-cola", '{"actor":"otro"}', workerHeaders)))
      .status === 400,
  );
  assert(!x.calls.tecnico);
});
Deno.test("worker sólo POST y resultado encolado no es entrega", async () => {
  const x = setup();
  assert(
    (await x.handle(req("/procesar-cola", undefined, workerHeaders))).status ===
      405,
  );
});
Deno.test("fallo PDF antes de despacho se pospone, otro correo progresa", async () => {
  let claims = 0;
  const x = setup({
    rpc: (n) => {
      if (n === "reservar_correos") {
        return {
          data: claims++ === 0
            ? [{
              id,
              reserva_id: rv,
              intencion_id: rv,
              documento_path: "privado.pdf",
              email: "uno@example.test",
              asunto_snapshot: "Documento",
              cuerpo_snapshot: "Texto",
            }]
            : claims === 2
            ? [{
              id: rv,
              reserva_id: rv,
              email: "dos@example.test",
              asunto_snapshot: "Aviso",
              cuerpo_snapshot: "Otro",
            }]
            : [],
          error: null,
        };
      }
      return {
        data: n === "marcar_despacho_correo" ? { iniciado: true } : null,
        error: null,
      };
    },
    adjunto: () => {
      throw new Error("Fallo de Storage");
    },
  });
  const result = await x.handle(req("/procesar-cola", "{}", workerHeaders));
  assert(result.status === 200 && (await result.json()).procesados === 1);
  assert(
    x.calls.send === 1 &&
      x.calls.rpc.filter((x) => x === "posponer_correo_documental").length ===
        1 &&
      x.calls.rpc.filter((x) => x === "marcar_despacho_correo").length === 1 &&
      x.calls.rpc.filter((x) => x === "finalizar_correo").length === 1,
  );
});
Deno.test("reserva perdida antes del transporte no envía", async () => {
  let count = 0;
  const x = setup({
    rpc: (n) => ({
      data: n === "reservar_correos"
        ? (count++ === 0
          ? [{
            id,
            reserva_id: rv,
            email: "uno@example.test",
            asunto_snapshot: "Aviso",
            cuerpo_snapshot: "Texto",
          }]
          : [])
        : n === "marcar_despacho_correo"
        ? { iniciado: false }
        : null,
      error: null,
    }),
  });
  await x.handle(req("/procesar-cola", "{}", workerHeaders));
  assert(x.calls.send === 0 && !x.calls.rpc.includes("finalizar_correo"));
});
Deno.test("timeout después de marca conserva resultado incierto", async () => {
  let count = 0, estado = "";
  const x = setup({
    rpc: (n, args) => {
      if (n === "finalizar_correo") estado = String(args.p_estado);
      return {
        data: n === "reservar_correos"
          ? (count++ === 0
            ? [{
              id,
              reserva_id: rv,
              email: "uno@example.test",
              asunto_snapshot: "Aviso",
              cuerpo_snapshot: "Texto",
            }]
            : [])
          : n === "marcar_despacho_correo"
          ? { iniciado: true }
          : null,
        error: null,
      };
    },
    enviar: () => {
      throw new Error("Respuesta perdida");
    },
  });
  await x.handle(req("/procesar-cola", "{}", workerHeaders));
  assert(estado === "incierto" && x.calls.send === 1);
});
Deno.test("transaccional lleva PDF interno sin enlace de baja general", async () => {
  let count = 0;
  const x = setup({
    rpc: (n) => ({
      data: n === "reservar_correos"
        ? (count++ === 0
          ? [{
            id,
            reserva_id: rv,
            intencion_id: rv,
            documento_path: "privado.pdf",
            email: "uno@example.test",
            asunto_snapshot: "Documento",
            cuerpo_snapshot: "Texto histórico",
          }]
          : [])
        : n === "marcar_despacho_correo"
        ? { iniciado: true }
        : null,
      error: null,
    }),
    adjunto: () =>
      Promise.resolve({
        bytes: new Uint8Array(100),
        nombre: "comprobante.pdf",
        tipo: "application/pdf",
      }),
    enviar: (m) => {
      assert(
        m.adjuntos?.length === 1 && m.text === "Texto histórico" &&
          !m.html.includes("desuscribir"),
      );
      return Promise.resolve("message");
    },
  });
  assert(
    (await x.handle(req("/procesar-cola", "{}", workerHeaders))).status ===
        200 && x.calls.send === 1,
  );
});
Deno.test("perfil inactivo se rechaza antes del cliente humano", async () => {
  const x = setup({
    autorizar: () => {
      throw new AppError("Sin permiso", 403);
    },
  });
  assert(
    (await x.handle(req("/historial"))).status === 403 &&
      !x.calls.select.length,
  );
});
for (
  const query of [
    "?page=0",
    "?pageSize=10",
    "?page=1&page=2",
    "?estado=entregado",
    "?sortBy=autor",
    "?desde=2026-10-26",
    "?desde=2026-10-27T00:00:00Z&hasta=2026-10-26T00:00:00Z",
    "?actor=otro",
  ]
) {
  Deno.test("filtros inválidos " + query, async () => {
    const x = setup();
    assert((await x.handle(req("/historial" + query))).status === 400);
  });
}
Deno.test("historial no expone campos técnicos aunque DB agregue propiedades", async () => {
  const x = setup({
    rows: [{
      id,
      asunto: "Asunto",
      fecha_envio: "2026-10-26T00:00:00Z",
      origen: "manual",
      tipo: "general",
      estado: "procesando",
      destinatarios_count: 1,
      autor_nombre_snapshot: "Responsable sintético",
      provider_message_id: "PRIVADO",
      request_id: "PRIVADO",
      solicitud: { secret: "PRIVADO" },
    }],
  });
  const data = await (await x.handle(req("/historial"))).json();
  assert(
    data.envios[0].autor_nombre === "Responsable sintético" &&
      !JSON.stringify(data).includes("PRIVADO"),
  );
});
Deno.test("detalle conserva snapshots y separa aceptación de evento", async () => {
  const x = setup({
    envio: {
      id,
      asunto: "Histórico",
      cuerpo: "Cuerpo histórico",
      origen: "manual",
      tipo: "general",
      estado: "procesando",
      destinatarios_count: 1,
      fecha_envio: "2026-10-26T00:00:00Z",
      autor_nombre_snapshot: null,
    },
    rows: [{
      id,
      email: "viejo@example.test",
      nombre_snapshot: "Nombre histórico",
      apellido_snapshot: "Sintético",
      asunto_snapshot: "Asunto histórico",
      cuerpo_snapshot: "Texto histórico",
      estado_envio: "incierto",
      entrega_estado: "sin_confirmar",
      motivo: null,
      aceptado_en: null,
      reserva_id: "PRIVADO",
      provider_message_id: "PRIVADO",
    }],
    rpc: () => ({
      data: [{
        destinatario_id: id,
        tipo: "email.delivery_delayed",
        ocurrido_en: "2026-10-26T00:01:00Z",
      }],
      error: null,
    }),
  });
  const data = await (await x.handle(req("/historial/" + id))).json();
  assert(
    data.destinatarios[0].email === "viejo@example.test" &&
      data.destinatarios[0].aceptado_en === null &&
      data.destinatarios[0].ultimo_evento_en === "2026-10-26T00:01:00Z" &&
      !JSON.stringify(data).includes("PRIVADO"),
  );
});
Deno.test("notificación admite exactamente una operación", async () => {
  const x = setup();
  for (
    const q of [
      "",
      "?jobId=" + id + "&comprobanteId=" + rv,
      "?comprobanteId=incorrecto",
      "?comprobanteId=" + id + "&actor=x",
    ]
  ) assert((await x.handle(req("/notificacion" + q))).status === 400);
});
Deno.test("Responsable no consulta reporte reservado a Admin", async () => {
  const x = setup({ rpc: () => ({ data: null, error: { code: "42501" } }) });
  assert((await x.handle(req("/notificacion?jobId=" + id))).status === 403);
});
Deno.test("notificación muestra advertencia sin repetir operación", async () => {
  const x = setup({
    rpc: () => ({
      data: {
        estado: "advertencia",
        advertencia: "Sin dirección de correo válida",
      },
      error: null,
    }),
  });
  const res = await x.handle(req("/notificacion?comprobanteId=" + id));
  assert(
    res.status === 200 && (await res.json()).estado === "advertencia" &&
      x.calls.rpc.length === 1,
  );
});
Deno.test("GET de baja es inocuo y no revela dirección", async () => {
  const sig = await firmarBaja(id, secret), x = setup();
  const response = await x.handle(
    req("/desuscribir?id=" + id + "&firma=" + sig),
  );
  const html = await response.text();
  assert(
    response.status === 200 && html.includes("Confirmar baja") &&
      !html.includes(id) && !x.calls.tecnico,
  );
});
for (
  const estado of [
    "confirmada",
    "ya_confirmada",
    "direccion_antigua",
    "no_disponible",
  ]
) {
  Deno.test("baja POST estado " + estado, async () => {
    const sig = await firmarBaja(id, secret),
      x = setup({
        rpc: () => ({
          data: { resultado: estado, email_nuevo: "PRIVADO" },
          error: null,
        }),
      });
    const response = await x.handle(
      req("/desuscribir?id=" + id + "&firma=" + sig, "", {}, "POST"),
    );
    const html = await response.text();
    assert(
      response.status === (estado === "no_disponible" ? 404 : 200) &&
        !html.includes("PRIVADO") && !html.includes(id) &&
        x.calls.rpc[0] === "desuscribir_correo_confirmado",
    );
  });
}
Deno.test("enlace alterado devuelve página de error sin mutar", async () => {
  const x = setup();
  const r = await x.handle(req("/desuscribir?id=" + id + "&firma=alterada"));
  assert(
    r.status === 400 && (await r.text()).includes("Enlace inválido") &&
      !x.calls.tecnico,
  );
});
Deno.test("desuscribir negocia JSON para frontend sin mutar en GET y confirma en POST", async () => {
  const sig = await firmarBaja(id, secret);
  const x = setup({
    rpc: () => ({ data: { resultado: "confirmada" }, error: null }),
  });
  const getRes = await x.handle(
    req("/desuscribir?id=" + id + "&firma=" + sig, undefined, {
      Accept: "application/json",
    }),
  );
  assert(
    getRes.status === 200 &&
      getRes.headers.get("content-type")?.includes("application/json") &&
      getRes.headers.get("access-control-allow-origin") === "*" &&
      (await getRes.json()).estado === "confirmar" && !x.calls.tecnico,
  );
  const badRes = await x.handle(
    req("/desuscribir?id=" + id + "&firma=alterada", undefined, {
      Accept: "application/json",
    }),
  );
  assert(badRes.status === 400 && (await badRes.json()).estado === "invalido");
  const postRes = await x.handle(
    req("/desuscribir?id=" + id + "&firma=" + sig, "", {
      Accept: "application/json",
    }, "POST"),
  );
  assert(
    postRes.status === 200 &&
      (await postRes.json()).estado === "confirmada" &&
      x.calls.rpc[0] === "desuscribir_correo_confirmado",
  );
});
Deno.test("procesarCola usa urlBaja del frontend cuando está configurada", async () => {
  let cuerpoTexto = "";
  let cuerpoHtml = "";
  let reservado = false;
  const x = setup({
    urlBaja: () => "https://club-los-andes.pages.dev/desuscribir",
    rpc: (name) => {
      if (name === "reservar_correos") {
        if (reservado) return { data: [], error: null };
        reservado = true;
        return {
          data: [{
            id,
            reserva_id: rv,
            email: "socio@example.test",
            asunto_snapshot: "Novedad",
            cuerpo_snapshot: "Hola",
            intencion_id: null,
            documento_path: null,
          }],
          error: null,
        };
      }
      if (name === "marcar_despacho_correo") {
        return { data: { iniciado: true }, error: null };
      }
      return { data: null, error: null };
    },
    enviar: (msg) => {
      cuerpoTexto = msg.text;
      cuerpoHtml = msg.html;
      return Promise.resolve("msg-ok");
    },
  });
  const res = await x.handle(
    req("/procesar-cola", "{}", { "x-mail-worker-secret": secret }, "POST"),
  );
  assert(
    res.status === 200 &&
      cuerpoTexto.includes(
        "https://club-los-andes.pages.dev/desuscribir?id=" + id + "&firma=",
      ) &&
      cuerpoHtml.includes(
        "https://club-los-andes.pages.dev/desuscribir?id=" + id + "&amp;firma=",
      ),
  );
});
async function firmado(body: string, secondsOffset = 0) {
  const timestamp = String(Math.floor(Date.now() / 1000) + secondsOffset),
    eventId = "evento-local";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("w".repeat(32)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(eventId + "." + timestamp + "." + body),
    ),
  );
  return {
    "svix-id": eventId,
    "svix-timestamp": timestamp,
    "svix-signature": "v1," + btoa(String.fromCharCode(...signature)),
  };
}
const event = JSON.stringify({
  type: "email.delivered",
  created_at: "2026-10-26T00:01:00Z",
  data: {
    email_id: "mensaje-local",
    to: ["privado@example.test"],
    other: "NO_PERSISTIR",
  },
});
Deno.test("webhook verifica bytes antes de interpretar JSON", async () => {
  const x = setup();
  const h = await firmado("otro cuerpo");
  const response = await x.handle(req("/webhook-resend", "{json inválido", h));
  assert(response.status === 401 && !x.calls.tecnico);
});
Deno.test("webhook válido sólo persiste evento mínimo y confirma después", async () => {
  const x = setup({
    rpc: (_n, args) => {
      assert(
        !JSON.stringify(args).includes("NO_PERSISTIR") &&
          !JSON.stringify(args).includes("privado@"),
      );
      return { data: null, error: null };
    },
  });
  const response = await x.handle(
    req("/webhook-resend", event, await firmado(event)),
  );
  assert(
    response.status === 200 && x.calls.rpc[0] === "registrar_evento_correo",
  );
});
Deno.test("fallo de persistencia webhook devuelve error recuperable", async () => {
  const x = setup({
    rpc: () => ({ data: null, error: { code: "CONNECTION" } }),
  });
  const response = await x.handle(
    req("/webhook-resend", event, await firmado(event)),
  );
  assert(
    response.status === 503 && !(await response.text()).includes("recibido"),
  );
});
Deno.test("webhook vencido no modifica eventos", async () => {
  const x = setup();
  assert(
    (await x.handle(req("/webhook-resend", event, await firmado(event, -301))))
          .status === 401 && !x.calls.tecnico,
  );
});

Deno.test("secreto técnico no configurado falla cerrado sin DB", async () => {
  const x = setup();
  x.deps.env = () => {
    throw new Error("CONFIG_PRIVADA");
  };
  const res = await x.handle(req("/procesar-cola", "{}", workerHeaders));
  assert(
    res.status === 401 && !x.calls.tecnico &&
      !(await res.text()).includes("CONFIG_PRIVADA"),
  );
});
