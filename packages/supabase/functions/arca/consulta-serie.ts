import { AppError, jsonResponse } from "@core/index.ts";
import {
  type ClubParaConsultaSerie,
  ConsultarSerieFiscalUseCase,
  type PuertoArca,
} from "@modules/fiscal/index.ts";

export interface DependenciasConsultaSerie {
  autorizar: (roles: ["admin"]) => Promise<unknown>;
  leerClub: () => Promise<ClubParaConsultaSerie>;
  crearPuerto: () => Pick<PuertoArca, "obtenerUltimoAutorizado">;
}
async function leerTipo(req: Request): Promise<number> {
  if (
    req.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !==
      "application/json"
  ) {
    throw new AppError("El cuerpo debe ser JSON.", 415);
  }
  const declared = Number(req.headers.get("content-length"));
  if (declared > 2048) throw new AppError("Solicitud demasiado grande.", 413);
  const text = await req.text();
  if (new TextEncoder().encode(text).length > 2048) {
    throw new AppError("Solicitud demasiado grande.", 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new AppError("Solicitud inválida.", 400);
  }
  // Un único campo numérico literal: rechaza extras, anidación y claves duplicadas.
  if (
    !/^\s*\{\s*"tipoComprobante"\s*:\s*[^{}\[\],]+\s*\}\s*$/.test(text) ||
    !body || typeof body !== "object" || Array.isArray(body) ||
    Object.keys(body).length !== 1 || !("tipoComprobante" in body) ||
    typeof body.tipoComprobante !== "number" ||
    !Number.isSafeInteger(body.tipoComprobante) ||
    body.tipoComprobante < 1 || body.tipoComprobante > 999
  ) {
    throw new AppError(
      "La consulta admite únicamente tipoComprobante entero de1 a999.",
      400,
    );
  }
  return body.tipoComprobante;
}
export async function resolverConsultaSerie(
  req: Request,
  deps: DependenciasConsultaSerie,
): Promise<Response> {
  if (req.method !== "POST") throw new AppError("Método no permitido", 405);
  await deps.autorizar(["admin"]);
  const tipo = await leerTipo(req);
  const club = await deps.leerClub();
  const resultado = await new ConsultarSerieFiscalUseCase(deps.crearPuerto())
    .ejecutar(club, tipo);
  return jsonResponse(resultado);
}
