import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdjuntoPdf, MensajeIndividual } from "@core/index.ts";
import {
  AppError,
  compararSecreto,
  corsHeaders,
  EnvioFallido,
  errorResponse,
  firmarBaja,
  jsonResponse,
  verificarBaja,
  verificarSvix,
} from "@core/index.ts";
import {
  CorreoInvalido,
  EnviarAvisoUseCase,
  formatearCuerpoCorreo,
  SocioRepository,
  uuidValido,
} from "@modules/comunicaciones/index.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

async function limitedText(req: Request, max = 65536) {
  if (Number(req.headers.get("content-length")) > max) {
    throw new AppError("Solicitud demasiado grande.", 413);
  }
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        await reader.cancel();
        throw new AppError("Solicitud demasiado grande.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("JSON inválido.", 400);
  }
}

function requireJson(req: Request) {
  if (
    req.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !==
      "application/json"
  ) {
    throw new AppError("Se requiere Content-Type application/json.", 415);
  }
}

function pagination(url: URL) {
  const rawPage = url.searchParams.get("page") ?? "1";
  const rawSize = url.searchParams.get("pageSize") ?? "20";
  if (!/^[1-9]\d*$/.test(rawPage) || !["20", "50", "100"].includes(rawSize)) {
    throw new AppError("Paginación inválida.", 400);
  }
  const page = Number(rawPage);
  const pageSize = Number(rawSize);
  if (!Number.isSafeInteger(page) || page > 1000000) {
    throw new AppError("Página inválida.", 400);
  }
  return {
    page,
    pageSize,
    from: (page - 1) * pageSize,
    to: page * pageSize - 1,
  };
}

function timestampParam(url: URL, name: string) {
  const value = url.searchParams.get(name);
  // El cliente convierte el rango de días del club a instantes con zona explícita.
  if (
    value !== null &&
    (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
      .test(value) || !Number.isFinite(Date.parse(value)))
  ) {
    throw new AppError(
      `El filtro ${name} debe ser una fecha ISO con zona horaria.`,
      400,
    );
  }
  return value;
}

export interface DependenciasComunicaciones {
  autorizar(req: Request): Promise<unknown>;
  humano(req: Request): SupabaseClient;
  tecnico(): SupabaseClient;
  env(name: string): string;
  proveedor(): "resend" | "mailpit";
  enviar(message: MensajeIndividual): Promise<string>;
  preparar(db: SupabaseClient, limiteTemporal: number): Promise<unknown>;
  adjunto(
    db: SupabaseClient,
    id: string,
    reserva: string,
  ): Promise<AdjuntoPdf | null>;
  ahora(): number;
  esperar(ms: number): Promise<void>;
}
function parametros(url: URL, allowed: string[]) {
  for (const k of url.searchParams.keys()) {
    if (!allowed.includes(k) || url.searchParams.getAll(k).length !== 1) {
      throw new AppError("Parámetros de consulta inválidos.", 400);
    }
  }
}
export function paginaBaja(
  estado:
    | "confirmar"
    | "confirmada"
    | "ya_confirmada"
    | "direccion_antigua"
    | "no_disponible"
    | "invalido"
    | "error",
  status = 200,
) {
  const content = {
    confirmar: [
      "Dejar de recibir comunicaciones generales",
      "Podés dejar de recibir novedades y comunicaciones generales del club. Los comprobantes y los avisos de deuda previstos pueden continuar.",
    ],
    confirmada: [
      "Baja confirmada",
      "Ya no recibirás comunicaciones generales en la dirección correspondiente a este enlace.",
    ],
    ya_confirmada: [
      "La baja ya estaba confirmada",
      "La dirección correspondiente a este enlace ya estaba desuscripta de comunicaciones generales.",
    ],
    direccion_antigua: [
      "Este enlace corresponde a una dirección anterior",
      "No se modificaron tus preferencias actuales. Para gestionar la dirección actual, contactá al club.",
    ],
    no_disponible: [
      "Este enlace ya no está disponible",
      "No se modificaron las preferencias de correo. Contactá al club si necesitás ayuda.",
    ],
    invalido: [
      "Enlace inválido",
      "No se modificaron las preferencias. Usá el enlace completo recibido en el correo o contactá al club.",
    ],
    error: [
      "No se pudo confirmar la baja",
      "No recibimos confirmación del cambio. Podés volver a intentarlo con este enlace.",
    ],
  }[estado];
  return new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preferencias de correo</title><style>body{margin:0;background:#f4f7fc;color:#17243b;font:16px/1.6 Arial,sans-serif}header{background:#fff;border-bottom:1px solid #e3e9f3;padding:20px 6%;font-weight:700}main{max-width:560px;margin:7vh auto;padding:36px;background:white;border:1px solid #e3e9f3;border-radius:16px;box-shadow:0 8px 30px #17345c09}h1{font-size:27px;line-height:1.3;margin:0 0 22px}p{color:#47586e}button{border:0;background:#2563eb;color:white;font:600 16px Arial,sans-serif;border-radius:8px;padding:14px 24px;cursor:pointer;width:100%}.nota{font-size:14px;border-top:1px solid #e3e9f3;padding-top:20px;margin-top:28px}@media(max-width:620px){main{margin:28px 16px;padding:26px}}</style></head><body><header>Comunicaciones del club</header><main><h1>${
      content[0]
    }</h1><p>${content[1]}</p>${
      estado === "confirmar"
        ? '<form method="post"><button type="submit">Confirmar baja</button></form>'
        : ""
    }<p class="nota">Esta preferencia afecta las comunicaciones generales. Para volver a recibirlas, podés solicitarlo al club.</p></main></body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
      },
    },
  );
}
function envioPublico(row: Record<string, unknown>, detalle = false) {
  return {
    id: row.id,
    asunto: row.asunto,
    fecha_envio: row.fecha_envio,
    estado: row.estado,
    origen: row.origen,
    tipo: row.tipo,
    destinatarios_count: row.destinatarios_count,
    autor_nombre: row.autor_nombre_snapshot ?? null,
    ...(detalle ? { cuerpo: row.cuerpo } : {}),
  };
}
export function crearManejadorComunicaciones(deps: DependenciasComunicaciones) {
  async function webhook(req: Request) {
    if (req.method !== "POST") {
      return errorResponse("Método no permitido.", 405);
    }
    const body = await limitedText(req, 262144);
    if (
      !await verificarSvix(
        body,
        req.headers,
        deps.env("RESEND_WEBHOOK_SECRET"),
      )
    ) return errorResponse("Firma inválida.", 401);
    const event = parseJson(body);
    if (!isRecord(event) || typeof event.type !== "string") {
      throw new AppError("Evento inválido.", 400);
    }
    if (
      ![
        "email.sent",
        "email.delivered",
        "email.delivery_delayed",
        "email.bounced",
        "email.failed",
      ].includes(event.type)
    ) return jsonResponse({ recibido: true });
    const data = event.data;
    if (
      !isRecord(data) || typeof data.email_id !== "string" ||
      typeof event.created_at !== "string" ||
      !Number.isFinite(Date.parse(event.created_at))
    ) throw new AppError("Evento inválido.", 400);
    const bounce = isRecord(data.bounce) ? data.bounce.type : null;
    const bounceTipo =
      ["Permanent", "Transient", "Undetermined"].includes(String(bounce))
        ? bounce
        : null;
    // No guardamos el payload completo, que puede contener datos o enlaces innecesarios.
    const { error } = await deps.tecnico().rpc("registrar_evento_correo", {
      p_event_id: req.headers.get("svix-id"),
      p_message_id: data.email_id,
      p_tipo: event.type,
      p_ocurrido: event.created_at,
      p_bounce_tipo: bounceTipo,
    });
    if (error) {
      throw new AppError(
        "No se pudo persistir el evento; el proveedor debe reintentarlo.",
        503,
      );
    }
    return jsonResponse({ recibido: true });
  }

  async function desuscribir(req: Request, url: URL) {
    if (req.method !== "GET" && req.method !== "POST") {
      return errorResponse("Método no permitido.", 405);
    }
    const id = url.searchParams.get("id");
    const signature = url.searchParams.get("firma") ?? "";
    if (
      !uuidValido(id) ||
      !await verificarBaja(id, signature, deps.env("MAIL_UNSUBSCRIBE_SECRET"))
    ) return paginaBaja("invalido", 400);
    // Sólo POST ejecuta una mutación; GET es seguro ante inspección automática del enlace.
    if (req.method === "GET") return paginaBaja("confirmar");
    const { data, error } = await deps.tecnico().rpc(
      "desuscribir_correo_confirmado",
      { p_destinatario: id },
    );
    if (error) return paginaBaja("error", 503);
    if (
      !data ||
      !["confirmada", "ya_confirmada", "direccion_antigua", "no_disponible"]
        .includes(data.resultado)
    ) return paginaBaja("error", 503);
    return paginaBaja(
      data.resultado,
      data.resultado === "no_disponible" ? 404 : 200,
    );
  }

  async function procesarCola(req: Request) {
    if (req.method !== "POST") {
      return errorResponse("Método no permitido.", 405);
    }
    let workerSecret: string;
    try {
      workerSecret = deps.env("MAIL_WORKER_SECRET");
    } catch {
      return errorResponse("No autorizado.", 401);
    }
    if (
      !await compararSecreto(
        req.headers.get("x-mail-worker-secret"),
        workerSecret,
      )
    ) return errorResponse("No autorizado.", 401);
    const raw = await limitedText(req, 128);
    if (raw.trim() && JSON.stringify(parseJson(raw)) !== "{}") {
      throw new AppError("El procesador no admite parámetros de negocio.", 400);
    }
    const proveedor = deps.proveedor();
    const admin = deps.tecnico();
    const started = deps.ahora();
    await deps.preparar(admin, started + 10000);
    let procesados = 0;
    // Un cron cada minuto llama esta ruta; cada pasada dura hasta 40s más el transporte en curso.
    // La reserva SQL limita globalmente a 50/min, también con workers simultáneos.
    while (deps.ahora() - started < 40000) {
      const { data, error } = await admin.rpc("reservar_correos", {
        p_proveedor: proveedor,
      });
      if (error) throw new AppError("No se pudo reservar la cola.", 503);
      const row = data?.[0];
      if (!row) break;
      const link = new URL(
        deps.env("MAIL_PUBLIC_BASE_URL").replace(/\/$/, "") + "/desuscribir",
      );
      link.searchParams.set("id", row.id);
      link.searchParams.set(
        "firma",
        await firmarBaja(row.id, deps.env("MAIL_UNSUBSCRIBE_SECRET")),
      );
      let adjunto: AdjuntoPdf | null = null;
      if (row.intencion_id && row.documento_path) {
        try {
          adjunto = await deps.adjunto(admin, row.id, row.reserva_id);
          if (!adjunto) throw new Error("DOCUMENTO_AUSENTE");
        } catch {
          const pending = await admin.rpc("posponer_correo_documental", {
            p_id: row.id,
            p_reserva: row.reserva_id,
          });
          if (pending.error) {
            throw new AppError(
              "No se confirmó la recuperación del documento; no se envió el mensaje.",
              503,
            );
          }
          continue;
        }
      }
      const mark = await admin.rpc("marcar_despacho_correo", {
        p_id: row.id,
        p_reserva: row.reserva_id,
      });
      if (mark.error) {
        throw new AppError(
          "No se confirmó la reserva antes del transporte.",
          503,
        );
      }
      if (!mark.data?.iniciado) continue;
      let estado = "aceptado";
      let messageId: string | null = null;
      let motivo: string | null = null;
      try {
        messageId = await deps.enviar({
          destinatarioId: row.id,
          to: row.email,
          subject: row.asunto_snapshot,
          text: row.intencion_id
            ? row.cuerpo_snapshot
            : `${row.cuerpo_snapshot}\n\nBaja de comunicaciones generales: ${link.toString()}`,
          html: formatearCuerpoCorreo(
            row.cuerpo_snapshot,
            row.intencion_id ? null : link.toString(),
          ),
          ...(adjunto ? { adjuntos: [adjunto] } : {}),
        });
      } catch (error) {
        estado = error instanceof EnvioFallido && !error.incierto
          ? "fallido"
          : "incierto";
        motivo = error instanceof EnvioFallido
          ? error.message
          : "No se pudo confirmar el envío.";
      }
      const { error: finalError } = await admin.rpc("finalizar_correo", {
        p_id: row.id,
        p_reserva: row.reserva_id,
        p_estado: estado,
        p_message_id: messageId,
        p_motivo: motivo,
      });
      if (finalError) {
        throw new AppError(
          "No se pudo registrar el resultado; la reserva será marcada incierta sin reenviar.",
          503,
        );
      }
      procesados++;
      await deps.esperar(1100);
    }
    return jsonResponse({ procesados });
  }

  async function handleRequest(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        headers: {
          ...corsHeaders,
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
      });
    }
    const url = new URL(req.url);
    const path = url.pathname.slice(
      url.pathname.lastIndexOf("/comunicaciones") + "/comunicaciones".length,
    );
    try {
      if (path === "/webhook-resend") return await webhook(req);
      if (path === "/desuscribir") {
        parametros(url, ["id", "firma"]);
        return await desuscribir(req, url);
      }
      if (path === "/procesar-cola") return await procesarCola(req);
      await deps.autorizar(req);
      const db = deps.humano(req);
      if (path === "/notificacion") {
        if (req.method !== "GET") {
          return errorResponse("Método no permitido.", 405);
        }
        parametros(url, ["comprobanteId", "jobId"]);
        const comprobanteId = url.searchParams.get("comprobanteId"),
          jobId = url.searchParams.get("jobId");
        if (
          (comprobanteId === null) === (jobId === null) ||
          comprobanteId !== null && !uuidValido(comprobanteId) ||
          jobId !== null && !uuidValido(jobId)
        ) throw new AppError("Indique una operación válida.", 400);
        const { data, error } = await db.rpc(
          "consultar_notificacion_operacion",
          { p_comprobante_id: comprobanteId, p_job_id: jobId },
        );
        if (error) {
          throw new AppError(
            error.code === "42501"
              ? "No tenés permiso para consultar esta notificación."
              : "No se pudo consultar la notificación.",
            error.code === "42501" ? 403 : 503,
          );
        }
        if (
          !data ||
          !["pendiente", "encolado", "advertencia", "sin_notificacion"]
            .includes(data.estado) ||
          !(data.advertencia === null || typeof data.advertencia === "string")
        ) throw new AppError("El estado de notificación no es válido.", 503);
        return jsonResponse({
          estado: data.estado,
          advertencia: data.advertencia,
        });
      }
      if (path === "/enviar-aviso") {
        if (req.method !== "POST") {
          return errorResponse("Método no permitido.", 405);
        }
        requireJson(req);
        const result = await new EnviarAvisoUseCase(new SocioRepository(db))
          .execute(parseJson(await limitedText(req)));
        return jsonResponse(result, 202);
      }
      if (path === "/plantillas") {
        if (req.method !== "GET") {
          return errorResponse("Método no permitido.", 405);
        }
        const { data, error } = await db.from("plantillas_correo").select(
          "id,nombre_interno,asunto,cuerpo,estado",
        ).eq("estado", "activo").order("nombre_interno");
        if (error) {
          throw new AppError("No se pudieron consultar las plantillas.", 503);
        }
        return jsonResponse({ templates: data });
      }
      if (path === "/historial") {
        if (req.method !== "GET") {
          return errorResponse("Método no permitido.", 405);
        }
        parametros(url, [
          "page",
          "pageSize",
          "estado",
          "desde",
          "hasta",
          "sortBy",
          "sortOrder",
        ]);
        const { page, pageSize, from, to } = pagination(url);
        const estado = url.searchParams.get("estado");
        if (
          estado !== null &&
          !["enviado", "fallido", "procesando"].includes(estado)
        ) throw new AppError("Estado inválido.", 400);
        const desde = timestampParam(url, "desde");
        const hasta = timestampParam(url, "hasta");
        if (desde && hasta && Date.parse(desde) >= Date.parse(hasta)) {
          throw new AppError("Rango de fechas inválido.", 400);
        }
        const sortBy = url.searchParams.get("sortBy") ?? "fecha_envio";
        const sortOrder = url.searchParams.get("sortOrder") ?? "desc";
        if (
          !["fecha_envio", "asunto", "destinatarios_count", "estado"].includes(
            sortBy,
          ) || !["asc", "desc"].includes(sortOrder)
        ) throw new AppError("Orden inválido.", 400);
        let query = db.from("email_logs").select(
          "id,origen,tipo,asunto,destinatarios_count,estado,fecha_envio,autor_nombre_snapshot",
          { count: "exact" },
        );
        if (estado) query = query.eq("estado", estado);
        if (desde) query = query.gte("fecha_envio", desde);
        if (hasta) query = query.lt("fecha_envio", hasta);
        const { data, error, count } = await query.order(sortBy, {
          ascending: sortOrder === "asc",
        }).order("id").range(from, to);
        if (error) {
          throw new AppError("No se pudo consultar el historial.", 503);
        }
        return jsonResponse({
          envios: (data ?? []).map((row: Record<string, unknown>) =>
            envioPublico(row)
          ),
          page,
          pageSize,
          total: count ?? 0,
        });
      }
      if (path.startsWith("/historial/")) {
        if (req.method !== "GET") {
          return errorResponse("Método no permitido.", 405);
        }
        const id = path.slice("/historial/".length);
        if (!uuidValido(id)) {
          throw new AppError("Identificador de envío inválido.", 400);
        }
        parametros(url, ["page", "pageSize"]);
        const { page, pageSize, from, to } = pagination(url);
        const { data: envio, error: envioError } = await db.from("email_logs")
          .select(
            "id,origen,tipo,asunto,cuerpo,destinatarios_count,estado,fecha_envio,autor_nombre_snapshot",
          ).eq("id", id).maybeSingle();
        if (envioError) {
          throw new AppError("No se pudo consultar el envío.", 503);
        }
        if (!envio) return errorResponse("Envío no encontrado.", 404);
        const { data: destinatarios, error: detalleError, count } = await db
          .from(
            "email_destinatarios",
          )
          .select(
            "id,email,nombre_snapshot,apellido_snapshot,estado_envio,entrega_estado,motivo,asunto_snapshot,cuerpo_snapshot,aceptado_en",
            { count: "exact" },
          )
          .eq("email_log_id", id).order("created_at").order("id").range(
            from,
            to,
          );
        if (detalleError) {
          throw new AppError("No se pudo consultar el detalle.", 503);
        }
        const eventos = await db.rpc("consultar_eventos_correo_log", {
          p_log_id: id,
        });
        if (eventos.error || !Array.isArray(eventos.data)) {
          throw new AppError(
            "No se pudo consultar el resultado de entrega.",
            503,
          );
        }
        const ultimo = new Map<string, string>();
        for (const e of eventos.data) {
          if (
            typeof e.destinatario_id === "string" &&
            typeof e.ocurrido_en === "string" &&
            (!ultimo.has(e.destinatario_id) ||
              e.ocurrido_en > ultimo.get(e.destinatario_id)!)
          ) ultimo.set(e.destinatario_id, e.ocurrido_en);
        }
        return jsonResponse({
          envio: envioPublico(envio, true),
          destinatarios: (destinatarios ?? []).map((
            d: Record<string, unknown>,
          ) => ({
            id: d.id,
            email: d.email,
            nombre_snapshot: d.nombre_snapshot ?? null,
            apellido_snapshot: d.apellido_snapshot ?? null,
            asunto_snapshot: d.asunto_snapshot,
            cuerpo_snapshot: d.cuerpo_snapshot,
            estado_envio: d.estado_envio,
            entrega_estado: d.entrega_estado,
            motivo: d.motivo,
            aceptado_en: d.aceptado_en,
            ultimo_evento_en: ultimo.get(String(d.id)) ?? null,
          })),
          page,
          pageSize,
          total: count ?? 0,
        });
      }
      return errorResponse("Ruta no encontrada.", 404);
    } catch (error) {
      if (error instanceof CorreoInvalido) {
        return errorResponse(error.message, 400);
      }
      if (error instanceof AppError) {
        return errorResponse(error.message, error.statusCode);
      }
      // No imprimir solicitudes, tokens ni listas de destinatarios en logs de runtime.
      console.error("Fallo interno de comunicaciones.");
      return errorResponse("No se pudo completar la operación.", 503);
    }
  }

  return handleRequest;
}
