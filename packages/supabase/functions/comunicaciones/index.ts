import { createEdgeClient } from "@core/supabase.ts";
import { requireRol } from "@core/auth.ts";
import { AppError } from "@core/errors.ts";
import { corsHeaders, errorResponse, jsonResponse } from "@core/cors.ts";
import { createMailAdmin, requiredEnv } from "@core/mail-admin.ts";
import {
  compararSecreto,
  firmarBaja,
  verificarBaja,
  verificarSvix,
} from "@core/mail-security.ts";
import {
  EnvioFallido,
  sendEmail,
  validarConfiguracionCorreo,
} from "@core/mailer.ts";
import { SocioRepository } from "@modules/comunicaciones/infrastructure/SocioRepository.ts";
import { EnviarAvisoUseCase } from "@modules/comunicaciones/application/EnviarAvisoUseCase.ts";
import {
  CorreoInvalido,
  formatearCuerpoCorreo,
  uuidValido,
} from "@modules/comunicaciones/domain/email_domain.ts";

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

async function webhook(req: Request) {
  if (req.method !== "POST") return errorResponse("Método no permitido.", 405);
  const body = await limitedText(req, 262144);
  if (
    !await verificarSvix(
      body,
      req.headers,
      requiredEnv("RESEND_WEBHOOK_SECRET"),
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
  const { error } = await createMailAdmin().rpc("registrar_evento_correo", {
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
    !await verificarBaja(id, signature, requiredEnv("MAIL_UNSUBSCRIBE_SECRET"))
  ) return errorResponse("Enlace de baja inválido.", 400);
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy":
      "default-src 'none'; form-action 'self'; frame-ancestors 'none'",
  };
  // GET nunca modifica preferencias: evita que un escáner de enlaces confirme la baja.
  if (req.method === "GET") {
    return new Response(
      // Sin action, el navegador conserva la URL pública y su query firmada,
      // incluso cuando el gateway elimina /functions/v1 antes de llamar al handler.
      '<!doctype html><html lang="es"><meta charset="utf-8"><title>Baja de comunicaciones</title><h1>Dejar de recibir comunicaciones generales</h1><p>Los avisos de deuda previstos por el club pueden continuar.</p><form method="post"><button>Confirmar baja</button></form></html>',
      { headers },
    );
  }
  const { error } = await createMailAdmin().rpc("desuscribir_correo", {
    p_destinatario: id,
  });
  if (error) {
    throw new AppError("No se pudo registrar la baja. Reintente.", 503);
  }
  return new Response(
    '<!doctype html><html lang="es"><meta charset="utf-8"><title>Baja registrada</title><h1>Baja registrada</h1><p>Ya no recibirá comunicaciones generales en la dirección correspondiente a este enlace.</p></html>',
    { headers },
  );
}

async function procesarCola(req: Request) {
  if (req.method !== "POST") return errorResponse("Método no permitido.", 405);
  if (
    !await compararSecreto(
      req.headers.get("x-mail-worker-secret"),
      requiredEnv("MAIL_WORKER_SECRET"),
    )
  ) return errorResponse("No autorizado.", 401);
  const proveedor = validarConfiguracionCorreo();
  const admin = createMailAdmin();
  const started = Date.now();
  let procesados = 0;
  // Un cron cada minuto llama esta ruta; cada pasada dura hasta 40s más el transporte en curso.
  // La reserva SQL limita globalmente a 50/min, también con workers simultáneos.
  while (Date.now() - started < 40000) {
    const { data, error } = await admin.rpc("reservar_correos", {
      p_proveedor: proveedor,
    });
    if (error) throw new AppError("No se pudo reservar la cola.", 503);
    const row = data?.[0];
    if (!row) break;
    const link = new URL(
      requiredEnv("MAIL_PUBLIC_BASE_URL").replace(/\/$/, "") + "/desuscribir",
    );
    link.searchParams.set("id", row.id);
    link.searchParams.set(
      "firma",
      await firmarBaja(row.id, requiredEnv("MAIL_UNSUBSCRIBE_SECRET")),
    );
    let estado = "aceptado";
    let messageId: string | null = null;
    let motivo: string | null = null;
    try {
      messageId = await sendEmail({
        destinatarioId: row.id,
        to: row.email,
        subject: row.asunto_snapshot,
        text:
          `${row.cuerpo_snapshot}\n\nBaja de comunicaciones generales: ${link.toString()}`,
        html: formatearCuerpoCorreo(row.cuerpo_snapshot, link.toString()),
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
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }
  return jsonResponse({ procesados });
}

export async function handleRequest(req: Request): Promise<Response> {
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
    if (path === "/desuscribir") return await desuscribir(req, url);
    if (path === "/procesar-cola") return await procesarCola(req);
    await requireRol({ req: { raw: req } }, ["admin", "responsable"]);
    const db = createEdgeClient(req);
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
        "id,plantilla_id,usuario_id,origen,tipo,asunto,destinatarios_count,estado,fecha_envio",
        { count: "exact" },
      );
      if (estado) query = query.eq("estado", estado);
      if (desde) query = query.gte("fecha_envio", desde);
      if (hasta) query = query.lt("fecha_envio", hasta);
      const { data, error, count } = await query.order(sortBy, {
        ascending: sortOrder === "asc",
      }).order("id").range(from, to);
      if (error) throw new AppError("No se pudo consultar el historial.", 503);
      return jsonResponse({ envios: data, page, pageSize, total: count ?? 0 });
    }
    if (path.startsWith("/historial/")) {
      if (req.method !== "GET") {
        return errorResponse("Método no permitido.", 405);
      }
      const id = path.slice("/historial/".length);
      if (!uuidValido(id)) {
        throw new AppError("Identificador de envío inválido.", 400);
      }
      const { page, pageSize, from, to } = pagination(url);
      const { data: envio, error: envioError } = await db.from("email_logs")
        .select(
          "id,plantilla_id,usuario_id,origen,tipo,asunto,cuerpo,destinatarios_count,estado,fecha_envio",
        ).eq("id", id).maybeSingle();
      if (envioError) throw new AppError("No se pudo consultar el envío.", 503);
      if (!envio) return errorResponse("Envío no encontrado.", 404);
      const { data: destinatarios, error: detalleError, count } = await db.from(
        "email_destinatarios",
      )
        .select(
          "id,socio_id,email,estado_envio,entrega_estado,motivo,asunto_snapshot,cuerpo_snapshot,aceptado_en",
          { count: "exact" },
        )
        .eq("email_log_id", id).order("created_at").order("id").range(from, to);
      if (detalleError) {
        throw new AppError("No se pudo consultar el detalle.", 503);
      }
      return jsonResponse({
        envio,
        destinatarios,
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

Deno.serve(handleRequest);
