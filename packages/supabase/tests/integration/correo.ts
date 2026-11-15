/**
 * Prueba de integración local de extremo a extremo para el módulo de comunicaciones:
 * plantillas, avisos manuales (general y deuda), despacho SMTP hacia Mailpit,
 * baja en dos pasos, intenciones post-commit con adjunto PDF privado en Storage,
 * reporte automático de generación de cuotas y conciliación de webhooks firmados (Svix).
 */
import { createHmac } from "node:crypto";
import {
  ejecutarSqlLocal as sql,
  leerVariablesEntornoFunciones,
  literalSql as lit,
  obtenerEstadoSupabase,
  prepararCuentasPrueba,
  resolverRutasRepositorio,
} from "./_entorno";

const { backend } = resolverRutasRepositorio();
const status = obtenerEstadoSupabase(backend);
const env = leerVariablesEntornoFunciones(backend);

const hostsSmtpPermitidos = new Set([
  "host.docker.internal",
  "127.0.0.1",
  "localhost",
  "supabase_inbucket_sistema-club-los-andes",
]);
if (
  env.MAIL_PROVIDER !== "mailpit" ||
  !hostsSmtpPermitidos.has(env.SMTP_HOST ?? "") ||
  !["54325", "1025"].includes(env.SMTP_PORT ?? "") ||
  !env.MAIL_WORKER_SECRET ||
  !env.RESEND_WEBHOOK_SECRET?.startsWith("whsec_")
) {
  throw new Error(
    "Configuración de correo local inválida: se requiere MAIL_PROVIDER=mailpit, SMTP local, MAIL_WORKER_SECRET y RESEND_WEBHOOK_SECRET=whsec_<base64> en functions/.env.",
  );
}

const { porRol, limpiar: limpiarCuentas } = await prepararCuentasPrueba(status, [
  "admin",
  "responsable",
]);
const adminAccount = porRol.admin;
const respAccount = porRol.responsable;

const marker = crypto.randomUUID().slice(0, 8);
const baseDni = 93000000 + (Number.parseInt(marker.slice(0, 5), 16) % 6000000);
const f: Record<string, any> = {
  marker,
  objetosStorage: [] as string[],
};
const checks: { caso: string; correcto: boolean }[] = [];

function check(caso: string, correcto: boolean) {
  checks.push({ caso, correcto });
  console.log(`${correcto ? "OK" : "FALLO"}: ${caso}`);
  if (!correcto) throw new Error(caso);
}

async function api(
  path: string,
  token: string | null,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
  extra: Record<string, string> = {},
) {
  const res = await fetch(status.API_URL + path, {
    method,
    headers: {
      apikey: status.ANON_KEY,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "content-type": "application/json",
      Prefer: "return=representation",
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(path.includes("procesar-cola") ? 120000 : 30000),
  });
  const raw = await res.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }
  return { http: res.status, data, raw };
}

async function autenticarActores(): Promise<{
  admin: string;
  responsable: string;
}> {
  const tokens: Record<string, string> = {};
  for (const cuenta of [adminAccount, respAccount]) {
    const login = await api("/functions/v1/acceso", null, {
      operacion: "login",
      email: cuenta.email,
      password: cuenta.password,
    });
    if (login.http !== 200 || !login.data?.session?.access_token) {
      throw new Error(
        `No se pudo autenticar cuenta ${cuenta.kind} (HTTP ${login.http}).`,
      );
    }
    tokens[cuenta.kind] = login.data.session.access_token;
  }
  return tokens as { admin: string; responsable: string };
}

const t = await autenticarActores();

async function insert(table: string, body: object, token = t.admin) {
  const x = await api(`/rest/v1/${table}`, token, body);
  if (x.http !== 201) {
    throw new Error(`No se pudo preparar ${table} (HTTP ${x.http}).`);
  }
  return x.data[0].id as string;
}

async function ensureSocio(
  key: string,
  offsetDni: number,
  email: string | null,
  suscripto: boolean,
) {
  if (f[key]) return;
  const dni = String(baseDni + offsetDni);
  f[key] = await insert("socios", {
    dni,
    nombre: "Persona sintética",
    apellido: `Comunicaciones ${key} ${f.marker}`,
    fecha_nacimiento: "1990-01-01",
    email,
    telefono: null,
    direccion: null,
    acepta_comunicaciones: suscripto,
    contacto_emergencia_nombre: null,
    contacto_emergencia_telefono: null,
  });
}

async function inscribir(key: string) {
  if (f[key]) return;
  const x = await api("/rest/v1/rpc/confirmar_inscripcion", t.admin, {
    p_socio_id: f[key === "cuotaTrans" ? "trans" : "sinemail"],
    p_categoria_id: f.categoria,
  });
  if (x.http !== 200 || !x.data?.cuota_id) {
    throw new Error(`Inscripción no confirmada (HTTP ${x.http}).`);
  }
  f[key] = x.data.cuota_id;
}

async function cobrar(key: string, cuota: string) {
  if (f[key]) return;
  const x = await api("/rest/v1/rpc/cobrar_cuota", t.admin, {
    p_cuota_id: cuota,
    p_usuario_id: adminAccount.id,
    p_medio_pago: "efectivo",
    p_referencia: null,
  });
  if (x.http !== 200 || typeof x.data !== "string") {
    throw new Error(`Cobro no confirmado (HTTP ${x.http}).`);
  }
  f[key] = x.data;
}

async function worker() {
  const allowedLogs =
    [f.logGeneral, f.logDeuda].filter(Boolean).map(lit).join(",") || "NULL";
  const allowedDocs =
    [f.comprobanteTrans, f.comprobanteSin].filter(Boolean).map(lit).join(",") ||
    "NULL";
  const allowedJobs = f.jobReporte ? lit(f.jobReporte) : "NULL";
  const unrelated = sql(
    `SELECT json_build_object('destinatarios',(SELECT count(*)FROM public.email_destinatarios d WHERE d.estado_envio='pendiente'AND d.email_log_id NOT IN(${allowedLogs}) AND NOT EXISTS(SELECT 1 FROM private.correo_intenciones i WHERE i.email_log_id=d.email_log_id AND(i.comprobante_id IN(${allowedDocs})OR i.job_id IN(${allowedJobs})))),'intenciones',(SELECT count(*)FROM private.correo_intenciones i WHERE i.estado='pendiente' AND i.proximo_intento_en <= clock_timestamp() AND NOT coalesce(i.comprobante_id IN(${allowedDocs})OR i.job_id IN(${allowedJobs}),false)));`,
  );
  if (Object.values(JSON.parse(unrelated)).some((v) => v !== 0)) {
    throw new Error(
      "Existen correos o intenciones pendientes ajenas a la prueba; abortando procesador.",
    );
  }
  const result = await api(
    "/functions/v1/comunicaciones/procesar-cola",
    null,
    {},
    "POST",
    { "x-mail-worker-secret": env.MAIL_WORKER_SECRET },
  );
  check(
    "procesador real confirma lote HTTP 200 con conteo",
    result.http === 200 && Number.isSafeInteger(result.data?.procesados),
  );
  return result.data.procesados;
}

async function detalle(id: string) {
  const x = await api(`/functions/v1/comunicaciones/historial/${id}`, t.responsable);
  if (x.http !== 200) {
    throw new Error(`Detalle no disponible (HTTP ${x.http}).`);
  }
  return x.data;
}

async function mensaje(to: string, pdf = false) {
  const mailbox = (await (
    await fetch(`${status.MAILPIT_URL}/api/v1/messages?limit=200`)
  ).json()) as any;
  for (const m of mailbox.messages ?? []) {
    if (!m.To?.some((a: any) => a.Address === to)) continue;
    const detail = (await (
      await fetch(`${status.MAILPIT_URL}/api/v1/message/${m.ID}`)
    ).json()) as any;
    if (pdf && !detail.Attachments?.length) continue;
    return { ...detail, ID: m.ID };
  }
  return null;
}

function snapshotDinero() {
  return sql(
    `SELECT jsonb_build_object('pagos',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'cuota',p.cuota_id,'estado',p.estado,'monto',p.monto)ORDER BY p.id)FROM public.pagos p WHERE p.cuota_id IN(${lit(f.cuotaTrans)},${lit(f.cuotaSin)})),'cuotas',(SELECT jsonb_agg(jsonb_build_object('id',id,'monto',monto,'estado',estado)ORDER BY id)FROM public.cuotas WHERE id IN(${lit(f.cuotaTrans)},${lit(f.cuotaSin)})));`,
  );
}

const intencionesPrevias = JSON.parse(
  sql(
    `SELECT coalesce(jsonb_agg(jsonb_build_object('id', id::text, 'proximo_intento_en', proximo_intento_en::text)), '[]'::jsonb) FROM private.correo_intenciones WHERE estado = 'pendiente';`,
  ),
) as { id: string; proximo_intento_en: string }[];

if (intencionesPrevias.length > 0) {
  const idsPrevios = intencionesPrevias.map((x) => lit(x.id)).join(",");
  sql(
    `BEGIN; SET LOCAL session_replication_role = 'replica'; UPDATE private.correo_intenciones SET proximo_intento_en = clock_timestamp() + interval '1 day' WHERE id IN (${idsPrevios}); COMMIT;`,
  );
}

const originalRecipients = sql(
  `SELECT coalesce(jsonb_object_agg(id::text,md5(to_jsonb(d)::text)),'{}')FROM public.email_destinatarios d;`,
);

try {
  check("destinos Mailpit, DB y API corresponden al entorno local", true);
  f.deporte = await insert("deportes", {
    nombre: `Comunicaciones SMTP ${f.marker}`,
    descripcion: "Datos sintéticos temporales de prueba",
  });
  f.categoria = await insert("categorias", {
    deporte_id: f.deporte,
    nombre: `Categoría ${f.marker}`,
    arancel_mensual: 1000,
    edad_min: null,
    edad_max: null,
  });

  await ensureSocio("trans", 1, `trans-${f.marker}@clublosandes.test`, false);
  await ensureSocio("general", 2, `general-${f.marker}@clublosandes.test`, true);
  await ensureSocio("invalido", 3, `invalido-${f.marker}@clublosandes.test`, true);
  await ensureSocio("sinemail", 4, null, false);
  sql(`UPDATE public.socios SET email_invalido=true WHERE id=${lit(f.invalido)};`);

  await inscribir("cuotaTrans");
  await inscribir("cuotaSin");

  f.plantilla = await insert(
    "plantillas_correo",
    {
      nombre_interno: `Plantilla ${f.marker}`,
      asunto: `AVISO GENERAL ${f.marker}`,
      cuerpo: `Hola {{nombre}}. <script>texto de prueba</script> ${f.marker}`,
      estado: "activo",
    },
    t.responsable,
  );

  const original = {
    requestId: crypto.randomUUID(),
    tipo: "general",
    asunto: `AVISO GENERAL ${f.marker}`,
    cuerpo: `Hola {{nombre}}. <script>texto de prueba</script> ${f.marker}`,
    sociosIds: [f.general, f.invalido],
    plantillaId: f.plantilla,
    incluirDesuscriptos: false,
  };
  f.requestGeneral = original.requestId;

  const encolado = await api(
    "/functions/v1/comunicaciones/enviar-aviso",
    t.responsable,
    original,
  );
  check(
    "Responsable encola general con un válido y un excluido",
    encolado.http === 202 &&
      encolado.data.encolados === 1 &&
      encolado.data.excluidos === 1,
  );
  f.logGeneral = encolado.data.id;

  const same = await api(
    "/functions/v1/comunicaciones/enviar-aviso",
    t.responsable,
    {
      ...original,
      sociosIds: [f.invalido, f.general, f.general],
    },
  );
  check(
    "mismo UUID y conjunto canónico no duplica envío",
    same.http === 202 && same.data.id === f.logGeneral,
  );

  const different = await api(
    "/functions/v1/comunicaciones/enviar-aviso",
    t.responsable,
    { ...original, cuerpo: "Distinto" },
  );
  check("mismo UUID con otro contenido se rechaza", different.http === 400);

  check(
    "tipo interno transaccional no se abre al navegador",
    (
      await api("/functions/v1/comunicaciones/enviar-aviso", t.responsable, {
        ...original,
        requestId: crypto.randomUUID(),
        tipo: "transaccional",
      })
    ).http === 400,
  );

  check(
    "edición de plantilla con JWT conserva permisos",
    (
      await api(
        `/rest/v1/plantillas_correo?id=eq.${f.plantilla}`,
        t.responsable,
        {
          cuerpo: "Texto editado que no reemplaza snapshots",
          estado: "inactivo",
        },
        "PATCH",
      )
    ).http === 200,
  );

  const detailBefore = await detalle(f.logGeneral);
  check(
    "historial conserva nombres y cuerpo históricos pese a plantilla editada",
    detailBefore.destinatarios.some(
      (d: any) =>
        d.estado_envio === "pendiente" &&
        d.cuerpo_snapshot.includes("<script>texto de prueba</script>") &&
        d.nombre_snapshot === "Persona sintética",
    ) && !!detailBefore.envio.autor_nombre,
  );

  check(
    "REST humano no expone reservas ni solicitud técnica",
    (await api("/rest/v1/email_destinatarios?select=reserva_id", t.responsable))
      .http === 403 &&
      (await api("/rest/v1/email_logs?select=solicitud", t.responsable)).http ===
        403,
  );

  f.requestDeuda = crypto.randomUUID();
  const deuda = await api(
    "/functions/v1/comunicaciones/enviar-aviso",
    t.responsable,
    {
      requestId: f.requestDeuda,
      tipo: "deuda",
      asunto: "No se toma este texto libre",
      cuerpo: "No se toma este texto libre",
      sociosIds: [f.trans],
      plantillaId: null,
      incluirDesuscriptos: true,
    },
  );
  check(
    "aviso de deuda admite excepción de desuscripto con contenido específico",
    deuda.http === 202 && deuda.data.encolados === 1,
  );
  f.logDeuda = deuda.data.id;

  const debtBefore = await detalle(f.logDeuda);
  check(
    "el servidor no utiliza el texto general en un aviso de deuda",
    !debtBefore.destinatarios[0].cuerpo_snapshot.includes(
      "No se toma este texto libre",
    ),
  );

  await worker();

  const sent = await detalle(f.logGeneral);
  check(
    "Mailpit aceptado permanece separado de entrega no confirmada",
    sent.destinatarios.some(
      (d: any) =>
        d.estado_envio === "aceptado" && d.entrega_estado === "sin_confirmar",
    ) && sent.destinatarios.some((d: any) => d.estado_envio === "excluido"),
  );

  const mailGeneral = await mensaje(`general-${f.marker}@clublosandes.test`);
  check(
    "SMTP real genera un mensaje individual con HTML escapado",
    mailGeneral?.To?.length === 1 &&
      mailGeneral.HTML.includes("&lt;script&gt;texto de prueba&lt;/script&gt;"),
  );

  const deudaMail = await mensaje(`trans-${f.marker}@clublosandes.test`);
  check(
    "Mailpit recibió el aviso de deuda del socio desuscripto",
    !!deudaMail && deudaMail.To.length === 1,
  );

  const linkText = String(mailGeneral.HTML)
    .replaceAll("&amp;", "&")
    .match(/href="([^"]+\/desuscribir\?[^"]+)"/)?.[1];
  if (!linkText) throw new Error("No se encontró enlace de baja.");
  const link = new URL(linkText);
  check(
    "enlace de baja pertenece al backend local",
    link.origin === status.API_URL,
  );

  const before = sql(
    `SELECT acepta_comunicaciones FROM public.socios WHERE id=${lit(f.general)};`,
  );
  const initial = await fetch(link);
  check(
    "GET real de baja no modifica preferencia",
    initial.status === 200 &&
      sql(
        `SELECT acepta_comunicaciones FROM public.socios WHERE id=${lit(f.general)};`,
      ) === before,
  );

  const down = await fetch(link, { method: "POST" });
  check(
    "POST real confirma baja",
    (await down.text()).includes("Baja confirmada") &&
      sql(
        `SELECT acepta_comunicaciones FROM public.socios WHERE id=${lit(f.general)};`,
      ) === "f",
  );

  const repeated = await fetch(link, { method: "POST" });
  check(
    "baja repetida es idempotente",
    (await repeated.text()).includes("ya estaba confirmada"),
  );

  check(
    "cambio autorizado de dirección sintética se confirma",
    (
      await api(
        `/rest/v1/socios?id=eq.${f.general}`,
        t.admin,
        {
          email: `nuevo-${f.marker}@clublosandes.test`,
          acepta_comunicaciones: true,
        },
        "PATCH",
      )
    ).http === 200,
  );

  const old = await fetch(link, { method: "POST" });
  check(
    "enlace antiguo no modifica la dirección nueva",
    (await old.text()).includes("dirección anterior") &&
      sql(
        `SELECT acepta_comunicaciones FROM public.socios WHERE id=${lit(f.general)};`,
      ) === "t",
  );

  const altered = new URL(link);
  altered.searchParams.set("firma", "alterada");
  check(
    "firma de baja alterada no modifica preferencias",
    (await fetch(altered, { method: "POST" })).status === 400 &&
      sql(
        `SELECT acepta_comunicaciones FROM public.socios WHERE id=${lit(f.general)};`,
      ) === "t",
  );

  await cobrar("comprobanteTrans", f.cuotaTrans);
  await cobrar("comprobanteSin", f.cuotaSin);
  const moneyBefore = snapshotDinero();

  const warning = await api(
    `/functions/v1/comunicaciones/notificacion?comprobanteId=${f.comprobanteSin}`,
    t.admin,
  );
  check(
    "cobro sin email sigue válido y muestra advertencia",
    warning.http === 200 && warning.data.estado === "advertencia",
  );

  const intentBefore = JSON.parse(
    sql(
      `SELECT jsonb_build_object('n',count(*),'id',min(id::text),'estado',min(estado))FROM private.correo_intenciones WHERE comprobante_id=${lit(f.comprobanteTrans)};`,
    ),
  );
  check(
    "corte después del commit deja intención recuperable única",
    intentBefore.n === 1 && intentBefore.estado === "pendiente",
  );

  await worker();

  const intentAfter = JSON.parse(
    sql(
      `SELECT jsonb_build_object('n',count(*),'estado',min(estado),'logs',count(email_log_id))FROM private.correo_intenciones WHERE comprobante_id=${lit(f.comprobanteTrans)};`,
    ),
  );
  check(
    "recuperación postcommit encola la misma intención sin otro cobro",
    intentAfter.n === 1 &&
      intentAfter.estado === "encolada" &&
      intentAfter.logs === 1 &&
      snapshotDinero() === moneyBefore,
  );

  const mailPdf = await mensaje(`trans-${f.marker}@clublosandes.test`, true);
  check(
    "transaccional real llega a desuscripto con un PDF privado",
    mailPdf?.Attachments?.length === 1 && mailPdf.To.length === 1,
  );

  const a = mailPdf.Attachments[0];
  const part = a.PartID ?? a.PartId ?? a.ID;
  const attachmentResponse = await fetch(
    `${status.MAILPIT_URL}/api/v1/message/${mailPdf.ID}/part/${encodeURIComponent(part)}`,
  );
  const bytes = new Uint8Array(await attachmentResponse.arrayBuffer());
  check(
    "adjunto descargado abre como PDF y tiene nombre controlado",
    attachmentResponse.status === 200 &&
      new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-" &&
      a.FileName === "comprobante-provisional.pdf",
  );

  const reference = JSON.parse(
    sql(
      `SELECT jsonb_build_object('path',documento_path,'destino',destinatario_snapshot)FROM private.correo_intenciones WHERE comprobante_id=${lit(f.comprobanteTrans)}AND evento='cobro_confirmado';`,
    ),
  );
  if (typeof reference.path === "string") {
    f.objetosStorage.push(reference.path);
  }
  const service = status.SERVICE_ROLE_KEY;
  const stored = await fetch(
    `${status.API_URL}/storage/v1/object/authenticated/club-archivos/${reference.path}`,
    {
      headers: { apikey: service, authorization: `Bearer ${service}` },
    },
  );
  const storedBytes = new Uint8Array(await stored.arrayBuffer());
  check(
    "adjunto MIME coincide byte por byte con Storage inmutable",
    stored.status === 200 &&
      bytes.length === storedBytes.length &&
      bytes.every((b, i) => b === storedBytes[i]),
  );

  await worker();
  check(
    "otra pasada no duplica notificación ni toca dinero",
    snapshotDinero() === moneyBefore &&
      sql(
        `SELECT count(*)FROM public.email_destinatarios WHERE intencion_id IN(SELECT id FROM private.correo_intenciones WHERE comprobante_id=${lit(f.comprobanteTrans)});`,
      ) === "1",
  );

  f.jobReporte = crypto.randomUUID();
  sql(
    `INSERT INTO public.cuota_job_logs(id,periodo_mes,periodo_anio,estado,cuotas_generadas,cuotas_omitidas,fecha_fin)VALUES(${lit(f.jobReporte)},12,9902,'exitoso',0,0,now())ON CONFLICT(id)DO NOTHING;`,
  );
  await worker();
  const jobId = f.jobReporte;
  check(
    "reporte sintético nuevo preserva origen automático y ninguna cuota",
    sql(
      `SELECT count(*)FROM private.correo_intenciones WHERE job_id=${lit(jobId)}AND origen='automatico'AND actor_id IS NULL;`,
    ) !== "0" &&
      sql(
        `SELECT cuotas_generadas FROM public.cuota_job_logs WHERE id=${lit(jobId)};`,
      ) === "0",
  );

  const jobBefore = sql(
    `SELECT to_jsonb(j)::text FROM public.cuota_job_logs j WHERE id=${lit(jobId)};`,
  );
  const reportAdmin = await api(
    `/functions/v1/comunicaciones/notificacion?jobId=${jobId}`,
    t.admin,
  );
  const reportResp = await api(
    `/functions/v1/comunicaciones/notificacion?jobId=${jobId}`,
    t.responsable,
  );
  check(
    "reporte del mismo job conserva éxito y acceso sólo Admin",
    reportAdmin.http === 200 &&
      ["encolado", "advertencia"].includes(reportAdmin.data.estado) &&
      reportResp.http === 403 &&
      jobBefore ===
        sql(
          `SELECT to_jsonb(j)::text FROM public.cuota_job_logs j WHERE id=${lit(jobId)};`,
        ),
  );

  f.webhook = {
    log: crypto.randomUUID(),
    dest: crypto.randomUUID(),
    reserva: crypto.randomUUID(),
    message: `simulacion-${f.marker}`,
    event: `delivered-${f.marker}`,
    bounce: `bounce-${f.marker}`,
  };
  const wh = f.webhook;
  sql(
    `INSERT INTO public.email_logs(id,usuario_id,asunto,cuerpo,destinatarios_count,origen,tipo)VALUES(${lit(wh.log)},${lit(adminAccount.id)},${lit(`Simulación webhook ${f.marker}`)},'Eventos sintéticos firmados locales.',1,'manual','general')ON CONFLICT(id)DO NOTHING;INSERT INTO public.email_destinatarios(id,email_log_id,socio_id,email,estado_envio,proveedor,reserva_id,reservado_en,despacho_iniciado,asunto_snapshot,cuerpo_snapshot)VALUES(${lit(wh.dest)},${lit(wh.log)},${lit(f.general)},${lit(`general-${f.marker}@clublosandes.test`)},'procesando','resend',${lit(wh.reserva)},now(),true,'Simulación','Evento sintético local')ON CONFLICT(id)DO NOTHING;`,
  );

  async function webhook(
    type: string,
    eventId: string,
    bounce?: string,
    offset = 0,
    alter = false,
  ) {
    const body = JSON.stringify({
      type,
      created_at: new Date().toISOString(),
      data: {
        email_id: wh.message,
        ...(bounce ? { bounce: { type: bounce } } : {}),
      },
    });
    const timestamp = String(Math.floor(Date.now() / 1000) + offset);
    const secret = Buffer.from(
      env.RESEND_WEBHOOK_SECRET.replace(/^whsec_/, ""),
      "base64",
    );
    const signature = createHmac("sha256", secret)
      .update(`${eventId}.${timestamp}.${body}`)
      .digest("base64");
    const response = await fetch(
      `${status.API_URL}/functions/v1/comunicaciones/webhook-resend`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "svix-id": eventId,
          "svix-timestamp": timestamp,
          "svix-signature": `v1,${alter ? "alterada" : signature}`,
        },
        body,
      },
    );
    return response.status;
  }

  check(
    "webhook firmado real persiste evento adelantado",
    (await webhook("email.delivered", wh.event)) === 200 &&
      sql(
        `SELECT count(*)FROM public.email_eventos WHERE event_id=${lit(wh.event)}AND destinatario_id IS NULL;`,
      ) === "1",
  );

  const finalized = await api("/rest/v1/rpc/finalizar_correo", service, {
    p_id: wh.dest,
    p_reserva: wh.reserva,
    p_estado: "aceptado",
    p_message_id: wh.message,
    p_motivo: null,
  });
  check(
    "aceptación sintética posterior concilia el evento adelantado",
    finalized.http === 204 &&
      sql(
        `SELECT entrega_estado FROM public.email_destinatarios WHERE id=${lit(wh.dest)};`,
      ) === "entregada",
  );

  check(
    "webhook duplicado no duplica evento",
    (await webhook("email.delivered", wh.event)) === 200 &&
      sql(
        `SELECT count(*)FROM public.email_eventos WHERE event_id=${lit(wh.event)};`,
      ) === "1",
  );

  check(
    "firma alterada y vencida no persisten eventos",
    (await webhook("email.failed", `alterado-${f.marker}`, undefined, 0, true)) ===
      401 &&
      (await webhook("email.failed", `vencido-${f.marker}`, undefined, -600)) ===
        401,
  );

  check(
    "rebote de dirección anterior no invalida la nueva",
    (await webhook("email.bounced", wh.bounce, "Permanent")) === 200 &&
      sql(`SELECT email_invalido FROM public.socios WHERE id=${lit(f.general)};`) ===
        "f",
  );

  const hookDetail = await detalle(wh.log);
  check(
    "detalle no expone firma/reserva/messageID y conserva fechas separadas",
    hookDetail.destinatarios[0].entrega_estado === "rebote_duro" &&
      !!hookDetail.destinatarios[0].aceptado_en &&
      !!hookDetail.destinatarios[0].ultimo_evento_en &&
      !JSON.stringify(hookDetail).includes(wh.message) &&
      !JSON.stringify(hookDetail).includes(wh.reserva),
  );

  const previous = JSON.parse(originalRecipients);
  const preserved = JSON.parse(
    sql(
      `SELECT coalesce(jsonb_object_agg(id::text,md5(to_jsonb(d)::text)),'{}')FROM public.email_destinatarios d WHERE id IN(${Object.keys(previous).map(lit).join(",") || "NULL"});`,
    ),
  );
  check(
    "destinatarios históricos previos conservados byte por byte",
    Object.keys(previous).every((id) => previous[id] === preserved[id]),
  );

  f.completada = true;
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Falló integración local de correo",
  );
  process.exitCode = 1;
} finally {
  for (const path of f.objetosStorage as string[]) {
    try {
      await fetch(`${status.API_URL}/storage/v1/object/club-archivos/${path}`, {
        method: "DELETE",
        headers: {
          apikey: status.ANON_KEY,
          Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
        },
      });
    } catch {
      // Ignorar errores secundarios al limpiar objeto de Storage.
    }
  }

  try {
    const sociosIds = [f.trans, f.general, f.invalido, f.sinemail]
      .filter(Boolean)
      .map(lit)
      .join(",");
    const docsIds = [f.comprobanteTrans, f.comprobanteSin]
      .filter(Boolean)
      .map(lit)
      .join(",");
    const logsDirectos = [f.logGeneral, f.logDeuda, f.webhook?.log]
      .filter(Boolean)
      .map(lit)
      .join(",");
    const jobClause = f.jobReporte ? lit(f.jobReporte) : "NULL";

    sql(`
      BEGIN;
      SET LOCAL session_replication_role = 'replica';
      ${
        f.webhook
          ? `DELETE FROM public.email_eventos WHERE event_id IN (${lit(f.webhook.event)}, ${lit(f.webhook.bounce)});`
          : ""
      }
      DELETE FROM public.email_eventos
        WHERE destinatario_id IN (
          SELECT id FROM public.email_destinatarios
          WHERE ${sociosIds ? `socio_id IN (${sociosIds})` : "false"}
             OR ${logsDirectos ? `email_log_id IN (${logsDirectos})` : "false"}
             OR intencion_id IN (
               SELECT id FROM private.correo_intenciones
               WHERE ${docsIds ? `comprobante_id IN (${docsIds})` : "false"}
                  OR job_id = ${jobClause}
             )
        );
      DELETE FROM public.email_destinatarios
        WHERE ${sociosIds ? `socio_id IN (${sociosIds})` : "false"}
           OR ${logsDirectos ? `email_log_id IN (${logsDirectos})` : "false"}
           OR intencion_id IN (
             SELECT id FROM private.correo_intenciones
             WHERE ${docsIds ? `comprobante_id IN (${docsIds})` : "false"}
                OR job_id = ${jobClause}
           );
      DELETE FROM public.email_logs
        WHERE ${logsDirectos ? `id IN (${logsDirectos})` : "false"}
           OR id IN (
             SELECT email_log_id FROM private.correo_intenciones
             WHERE email_log_id IS NOT NULL
               AND (${docsIds ? `comprobante_id IN (${docsIds})` : "false"} OR job_id = ${jobClause})
           );
      DELETE FROM private.correo_intenciones
        WHERE ${docsIds ? `comprobante_id IN (${docsIds})` : "false"}
           OR job_id = ${jobClause};
      ${f.jobReporte ? `DELETE FROM public.cuota_job_logs WHERE id = ${lit(f.jobReporte)};` : ""}
      ${f.plantilla ? `DELETE FROM public.plantillas_correo WHERE id = ${lit(f.plantilla)};` : ""}
      ${
        sociosIds
          ? `
        DELETE FROM public.comprobantes WHERE pago_id IN (SELECT p.id FROM public.pagos p JOIN public.cuotas q ON q.id = p.cuota_id WHERE q.socio_id IN (${sociosIds}));
        DELETE FROM public.pagos WHERE cuota_id IN (SELECT id FROM public.cuotas WHERE socio_id IN (${sociosIds}));
        DELETE FROM public.cuotas WHERE socio_id IN (${sociosIds});
        DELETE FROM public.inscripciones WHERE socio_id IN (${sociosIds});
        DELETE FROM private.fiscal_receptores WHERE socio_id IN (${sociosIds});
        DELETE FROM public.socios WHERE id IN (${sociosIds});
      `
          : ""
      }
      ${f.categoria ? `DELETE FROM public.categorias WHERE id = ${lit(f.categoria)};` : ""}
      ${f.deporte ? `DELETE FROM public.deportes WHERE id = ${lit(f.deporte)};` : ""}
      ${intencionesPrevias
        .map(
          (x) =>
            `UPDATE private.correo_intenciones SET proximo_intento_en = ${lit(x.proximo_intento_en)}::timestamptz WHERE id = ${lit(x.id)};`,
        )
        .join("\n")}
      COMMIT;
    `);
  } catch (cleanupError) {
    console.error(
      "Advertencia al limpiar fixtures de correo:",
      cleanupError instanceof Error ? cleanupError.message : cleanupError,
    );
  }

  await limpiarCuentas();
  const correcto =
    checks.length > 0 && checks.every((x) => x.correcto) && f.completada === true;
  console.log(
    JSON.stringify({
      comprobaciones: checks.length,
      correctas: checks.filter((x) => x.correcto).length,
      completada: correcto,
    }),
  );
  if (!correcto) process.exitCode = 1;
}
