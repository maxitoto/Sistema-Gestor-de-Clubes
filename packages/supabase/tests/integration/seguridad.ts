/**
 * Prueba de integración de seguridad HTTP, RLS y Storage privado.
 * Requiere contenedores locales y Edge Functions activas.
 * Aprovisiona sus propios fixtures temporales y los elimina al finalizar.
 */
import {
  ejecutarSqlLocal,
  eliminarUsuarioAuth,
  literalSql,
  obtenerEstadoSupabase,
  PNG_1X1_BYTES,
  prepararCuentasPrueba,
  resolverRutasRepositorio,
  type RolCuentaPrueba,
} from "./_entorno";

type Actor = RolCuentaPrueba | "anon";
type Value = Record<string, unknown>;
type Reply = { status: number; ok: boolean; body: unknown };

const { backend } = resolverRutasRepositorio();
const status = obtenerEstadoSupabase(backend);
const { cuentas: accounts, limpiar: limpiarCuentas } =
  await prepararCuentasPrueba(status, ["admin", "responsable", "inactivo"]);

const tokens: Partial<Record<Actor, string>> = { anon: status.ANON_KEY };
const checks: { caso: string; correcto: boolean; evidencia: Value }[] = [];
const marker = `SEG-${crypto.randomUUID().slice(0, 8)}`;
const fixture: {
  marker: string;
  id?: string;
  estado?: string;
  socioFotoId?: string;
  fotoPath?: string;
} = { marker };

const obj = (v: unknown): Value =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Value) : {};
const rows = (v: unknown): Value[] => (Array.isArray(v) ? v.map(obj) : []);

function record(caso: string, correcto: boolean, evidencia: Value = {}) {
  checks.push({ caso, correcto, evidencia });
  console.log(`${correcto ? "OK" : "FALLO"}: ${caso}`);
}

function denied(r: Reply) {
  return [401, 403].includes(r.status);
}

function invisible(r: Reply) {
  return denied(r) || (r.ok && rows(r.body).length === 0);
}

async function request(
  token: string,
  path: string,
  method = "GET",
  body?: unknown,
  extra: Record<string, string> = {},
): Promise<Reply> {
  const response = await fetch(status.API_URL + path, {
    method,
    headers: {
      apikey: status.ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { status: response.status, ok: response.ok, body: data };
}

const req = (actor: Actor, path: string, method = "GET", body?: unknown) =>
  request(tokens[actor] ?? status.ANON_KEY, path, method, body);

try {
  for (const kind of ["admin", "responsable", "inactivo"] as const) {
    const account = accounts.find((a) => a.kind === kind);
    if (!account) throw new Error("Falta cuenta de prueba requerida.");
    const login = await req("anon", "/functions/v1/acceso", "POST", {
      operacion: "login",
      email: account.email,
      password: account.password,
    });
    const token = obj(obj(login.body).session).access_token;
    record(
      `${kind}: login por gateway y JWT Auth real`,
      login.ok && typeof token === "string",
      { http: login.status },
    );
    if (typeof token !== "string") throw new Error("Login local no confirmado.");
    tokens[kind] = token;
    const profile = await req(
      kind,
      `/rest/v1/usuarios?id=eq.${account.id}&select=id,rol,estado`,
    );
    record(
      `${kind}: perfil real coherente`,
      profile.ok &&
        rows(profile.body)[0]?.estado ===
          (kind === "inactivo" ? "inactivo" : "activo"),
      { http: profile.status },
    );
  }

  for (const actor of ["admin", "responsable", "inactivo", "anon"] as const) {
    const active = actor === "admin" || actor === "responsable";
    for (const table of [
      "socios",
      "deportes",
      "categorias",
      "cuotas",
      "pagos",
      "gastos",
      "flujo_caja",
    ]) {
      const r = await req(
        actor,
        `/rest/v1/${table}?select=${table === "flujo_caja" ? "movimiento_id" : "id"}&limit=1`,
      );
      record(
        `${actor}: lectura directa ${table}`,
        active ? r.ok : invisible(r),
        { http: r.status, filas: rows(r.body).length },
      );
    }
    for (const grid of ["socios", "pagos", "gastos", "correos"]) {
      const r = await req(
        actor,
        "/rest/v1/rpc/consultar_grilla_reporte",
        "POST",
        {
          p_grilla: grid,
          p_criterios: { pagina: 0, limite: 20 },
        },
      );
      record(
        `${actor}: RPC grilla ${grid}`,
        active ? r.ok && obj(r.body).grilla === grid : denied(r),
        { http: r.status },
      );
    }
    const dashboard = await req(
      actor,
      "/rest/v1/rpc/consultar_dashboard",
      "POST",
      {
        p_mes: 10,
        p_anio: 2026,
      },
    );
    record(
      `${actor}: agregado dashboard sólo Admin`,
      actor === "admin" ? dashboard.ok : denied(dashboard),
      { http: dashboard.status },
    );
    const config = await req(actor, "/functions/v1/configuracion/fiscal");
    record(
      `${actor}: estado fiscal sólo Admin sin material`,
      actor === "admin"
        ? config.ok &&
            !/BEGIN .*PRIVATE KEY|BEGIN CERTIFICATE/.test(
              JSON.stringify(config.body),
            )
        : denied(config),
      { http: config.status },
    );
    for (const path of [
      "/functions/v1/fiscal-worker/procesar-pendientes",
      "/functions/v1/comunicaciones/procesar-cola",
    ]) {
      const r = await req(actor, path, "POST");
      record(
        `${actor}: worker ${path.includes("fiscal-worker") ? "fiscal" : "correo"} sin secreto técnico`,
        denied(r),
        { http: r.status },
      );
    }
    const id = "00000000-0000-4000-8000-000000000099";
    for (const [table, body] of [
      ["socios", { dni_corregido_por: "00000000-0000-4000-8000-000000000099" }],
      ["usuarios", { email: "no-escritura@clublosandes.test" }],
      ["pagos", { monto: 0 }],
    ] as const) {
      const r = await req(actor, `/rest/v1/${table}?id=eq.${id}`, "PATCH", body);
      record(`${actor}: columna directa restringida ${table}`, denied(r), {
        http: r.status,
        codigo: obj(r.body).code ?? null,
      });
    }
    const recipient = await req(
      actor,
      "/rest/v1/email_destinatarios?select=*&limit=1",
    );
    record(
      `${actor}: destinatarios individuales no accesibles directamente`,
      denied(recipient),
      { http: recipient.status },
    );
    const allEmail = await req(actor, "/rest/v1/email_logs?select=*&limit=1");
    record(
      `${actor}: SELECT* no amplía columnas de historial`,
      denied(allEmail),
      { http: allEmail.status },
    );
    const storage = await req(
      actor,
      "/storage/v1/object/list/club-archivos",
      "POST",
      { prefix: "", limit: 10, offset: 0 },
    );
    record(`${actor}: Storage directo no enumera objetos`, invisible(storage), {
      http: storage.status,
      objetos: rows(storage.body).length,
    });
  }

  // Preparar un socio sintético temporal con fotografía privada real validada por la Edge Function archivos.
  const dniTemporal = `9${String(1000000 + Math.floor(Math.random() * 8999999))}`;
  const socioAlta = await req("admin", "/rest/v1/socios", "POST", {
    dni: dniTemporal,
    nombre: "Socio",
    apellido: `Foto ${marker}`,
    fecha_nacimiento: "1990-01-01",
    email: null,
    telefono: null,
    direccion: null,
    acepta_comunicaciones: false,
    contacto_emergencia_nombre: null,
    contacto_emergencia_telefono: null,
  });
  const socioFotoId = rows(socioAlta.body)[0]?.id;
  if (typeof socioFotoId === "string") {
    fixture.socioFotoId = socioFotoId;
    const form = new FormData();
    form.set("tipo", "socio-foto");
    form.set("entidadId", socioFotoId);
    form.set(
      "archivo",
      new File([PNG_1X1_BYTES], "foto.png", { type: "image/png" }),
    );
    const uploadRes = await fetch(`${status.API_URL}/functions/v1/archivos/subir`, {
      method: "POST",
      headers: {
        apikey: status.ANON_KEY,
        Authorization: `Bearer ${tokens.admin}`,
      },
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    const uploadBody = obj(await uploadRes.json().catch(() => null));
    const storagePath = uploadBody.storagePath;
    if (uploadRes.ok && typeof storagePath === "string") {
      fixture.fotoPath = storagePath;
      await req("admin", "/functions/v1/archivos/asociar", "POST", {
        tipo: "socio-foto",
        entidadId: socioFotoId,
        storagePath,
      });
    }
  }

  const photo = await req(
    "admin",
    `/rest/v1/socios?id=eq.${fixture.socioFotoId ?? "00000000-0000-4000-8000-000000000000"}&foto_storage_path=not.is.null&select=id,foto_storage_path&limit=1`,
  );
  const existingPhoto = rows(photo.body)[0];
  if (
    existingPhoto &&
    typeof existingPhoto.id === "string" &&
    typeof existingPhoto.foto_storage_path === "string"
  ) {
    for (const actor of ["admin", "responsable", "inactivo", "anon"] as const) {
      const direct = await req(
        actor,
        `/storage/v1/object/club-archivos/${existingPhoto.foto_storage_path}`,
      );
      record(
        `${actor}: objeto privado real no se descarga directamente`,
        !direct.ok,
        { http: direct.status },
      );
      const signed = await req(
        actor,
        `/functions/v1/archivos/leer?tipo=socio-foto&entidadId=${existingPhoto.id}`,
      );
      const url = obj(signed.body).url;
      if (actor === "admin" || actor === "responsable") {
        const u = typeof url === "string" ? new URL(url) : null;
        record(
          `${actor}: Edge firma sólo tras autorizar`,
          signed.ok &&
            u?.origin === status.API_URL &&
            u?.pathname.includes("/object/sign/club-archivos/"),
          { http: signed.status },
        );
        if (u) {
          const response = await fetch(u, {
            redirect: "error",
            signal: AbortSignal.timeout(10000),
          });
          const bytes = new Uint8Array(await response.arrayBuffer());
          record(
            `${actor}: enlace privado autorizado descarga bytes reales`,
            response.ok && bytes.length > 0,
            { http: response.status, bytes: bytes.length },
          );
        }
      } else {
        record(
          `${actor}: no obtiene enlace privado por ID conocido`,
          denied(signed),
          { http: signed.status },
        );
      }
    }
  } else {
    record(
      "Fixture foto privada disponible para lectura de objeto real",
      false,
      { http: photo.status },
    );
  }

  // Preparación técnica de una cuenta exclusiva para validar sincronización de correo y baja inmediata.
  const email = `${marker.toLowerCase()}@clublosandes.test`;
  const password = `SegPrueba_${crypto.randomUUID()}7`;
  const made = await request(
    status.SERVICE_ROLE_KEY,
    "/auth/v1/admin/users",
    "POST",
    {
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre: "Seguridad", apellido: marker },
    },
  );
  const id = obj(made.body).id;
  record(
    "Fixture propio creado sólo por canal técnico local",
    made.ok && typeof id === "string",
    { http: made.status },
  );
  if (typeof id !== "string") {
    throw new Error("No se creó la cuenta exclusiva de prueba.");
  }
  fixture.id = id;

  const login = await req("anon", "/functions/v1/acceso", "POST", {
    operacion: "login",
    email,
    password,
  });
  const ownToken = obj(obj(login.body).session).access_token;
  record(
    "Fixture activo obtiene JWT Auth real",
    login.ok && typeof ownToken === "string",
    { http: login.status },
  );
  if (typeof ownToken !== "string") throw new Error("Fixture sin sesión.");

  const ownRead = await request(
    ownToken,
    "/rest/v1/rpc/consultar_grilla_reporte",
    "POST",
    {
      p_grilla: "socios",
      p_criterios: { pagina: 0, limite: 20 },
    },
  );
  record("Fixture activo accede antes de desactivación", ownRead.ok, {
    http: ownRead.status,
  });

  const email2 = `${marker.toLowerCase()}-nuevo@clublosandes.test`;
  const changed = await request(
    status.SERVICE_ROLE_KEY,
    `/auth/v1/admin/users/${id}`,
    "PUT",
    { email: email2, email_confirm: true },
  );
  const profile = await req(
    "admin",
    `/rest/v1/usuarios?id=eq.${id}&select=id,email,rol,estado`,
  );
  record(
    "Cambio de email por Auth sincroniza perfil mediante trigger",
    changed.ok && profile.ok && rows(profile.body)[0]?.email === email2,
    { httpAuth: changed.status, httpPerfil: profile.status },
  );

  const inactive = await req(
    "admin",
    `/rest/v1/usuarios?id=eq.${id}&select=id,estado`,
    "PATCH",
    { estado: "inactivo" },
  );
  record(
    "Fixture propio desactivado mediante política Admin",
    inactive.ok && rows(inactive.body)[0]?.estado === "inactivo",
    { http: inactive.status },
  );
  fixture.estado = "inactivo";

  for (const grid of ["socios", "pagos", "gastos", "correos"]) {
    const r = await request(
      ownToken,
      "/rest/v1/rpc/consultar_grilla_reporte",
      "POST",
      {
        p_grilla: grid,
        p_criterios: { pagina: 0, limite: 20 },
      },
    );
    record(`JWT previo a baja: ${grid} denegado al instante`, denied(r), {
      http: r.status,
    });
  }
  const endpoint = await request(
    ownToken,
    "/functions/v1/archivos/leer?tipo=socio-foto&entidadId=00000000-0000-4000-8000-000000000099",
  );
  record("JWT previo a baja: Edge verifica estado actual", denied(endpoint), {
    http: endpoint.status,
  });
} catch (error) {
  record("Ejecución completa sin error inesperado", false, {
    mensaje: error instanceof Error ? error.message : "Fallo no detallado",
  });
} finally {
  if (fixture.fotoPath) {
    try {
      await fetch(
        `${status.API_URL}/storage/v1/object/club-archivos/${fixture.fotoPath}`,
        {
          method: "DELETE",
          headers: {
            apikey: status.ANON_KEY,
            Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
          },
        },
      );
    } catch {
      // Ignorar errores secundarios al limpiar objeto de Storage.
    }
  }
  if (fixture.socioFotoId) {
    try {
      ejecutarSqlLocal(
        `BEGIN; SET LOCAL session_replication_role = 'replica'; DELETE FROM private.archivos_cargas WHERE entidad_id = ${literalSql(fixture.socioFotoId)}; DELETE FROM private.fiscal_receptores WHERE socio_id = ${literalSql(fixture.socioFotoId)}; DELETE FROM public.socios WHERE id = ${literalSql(fixture.socioFotoId)}; COMMIT;`,
      );
    } catch {
      // Ignorar errores secundarios al limpiar socio temporal.
    }
  }
  if (fixture.id) {
    try {
      await eliminarUsuarioAuth(status, fixture.id);
    } catch {
      // Ignorar errores secundarios al limpiar cuenta temporal.
    }
  }
  await limpiarCuentas();

  const correcto = checks.length > 0 && checks.every((c) => c.correcto);
  console.log(
    JSON.stringify({
      checks: checks.length,
      correcto,
      failed: checks.filter((c) => !c.correcto).map((c) => c.caso),
    }),
  );
  if (!correcto) process.exitCode = 1;
}
