export type SolicitudCorreo = {
  requestId: string;
  tipo: "general" | "deuda";
  asunto: string;
  cuerpo: string;
  sociosIds: string[];
  plantillaId: string | null;
  incluirDesuscriptos: boolean;
};

export class CorreoInvalido extends Error {}
export const uuidValido = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function validarSolicitud(raw: unknown): SolicitudCorreo {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new CorreoInvalido("Solicitud inválida.");
  }
  const r = raw as Record<string, unknown>;
  if (!uuidValido(r.requestId)) {
    throw new CorreoInvalido("requestId debe ser UUID.");
  }
  if (r.tipo !== "general" && r.tipo !== "deuda") {
    throw new CorreoInvalido("Tipo de aviso inválido.");
  }
  if (
    r.incluirDesuscriptos !== undefined &&
    typeof r.incluirDesuscriptos !== "boolean"
  ) {
    throw new CorreoInvalido("incluirDesuscriptos debe ser booleano.");
  }
  if (r.incluirDesuscriptos === true && r.tipo !== "deuda") {
    throw new CorreoInvalido("Solo los avisos de deuda admiten desuscriptos.");
  }
  if (
    !Array.isArray(r.sociosIds) || r.sociosIds.length < 1 ||
    r.sociosIds.length > 1000 || !r.sociosIds.every(uuidValido)
  ) {
    throw new CorreoInvalido("Seleccione entre 1 y 1000 socios válidos.");
  }
  if (r.plantillaId != null && !uuidValido(r.plantillaId)) {
    throw new CorreoInvalido("Plantilla inválida.");
  }
  let asunto = "";
  let cuerpo = "";
  if (r.tipo === "general") {
    if (typeof r.asunto !== "string" || typeof r.cuerpo !== "string") {
      throw new CorreoInvalido("Asunto y cuerpo deben ser texto.");
    }
    asunto = r.asunto.trim();
    cuerpo = r.cuerpo;
    if (
      !asunto || asunto.length > 255 || /[\r\n]/.test(asunto) ||
      !cuerpo.trim() || cuerpo.length > 10000
    ) throw new CorreoInvalido("Asunto o cuerpo inválidos.");
    const sinEtiquetas = (asunto + cuerpo).replace(
      /\{\{(nombre|apellido|deporte|deuda)\}\}/g,
      "",
    );
    if (sinEtiquetas.includes("{{") || sinEtiquetas.includes("}}")) {
      throw new CorreoInvalido("Etiqueta desconocida.");
    }
  }
  // Orden canónico: un reintento con los mismos destinatarios conserva la identidad.
  return {
    requestId: r.requestId.toLowerCase(),
    tipo: r.tipo,
    asunto,
    cuerpo,
    sociosIds: [...new Set(r.sociosIds.map((x) => x.toLowerCase()))].sort(),
    plantillaId: r.tipo === "deuda"
      ? null
      : (r.plantillaId as string | undefined)?.toLowerCase() ?? null,
    incluirDesuscriptos: r.incluirDesuscriptos === true,
  };
}

export function escaparHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}

export function formatearCuerpoCorreo(texto: string, bajaUrl: string): string {
  return `<main style="font-family:Arial,sans-serif;color:#222"><h2>Club Los Andes</h2><p>${
    escaparHtml(texto).replace(/\r?\n/g, "<br>")
  }</p><hr><p><a href="${
    escaparHtml(bajaUrl)
  }">Dejar de recibir comunicaciones generales</a></p><small>La baja no impide los avisos de deuda previstos por el club.</small></main>`;
}
