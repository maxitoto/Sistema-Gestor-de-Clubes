import {
  ContratoFiscalError,
  validarIdentidadFiscal,
} from "../domain/identidad-fiscal.ts";
import type { CodigoArca, PuertoArca } from "./PuertoArca.ts";

export interface ClubParaConsultaSerie {
  cuit: unknown;
  punto_venta: unknown;
}
export interface ConsultaSerieFiscalPublica {
  ambiente: "homologacion";
  servicio: "wsfe";
  operacion: "FECompUltimoAutorizado";
  puntoVentaConfigurado: number;
  tipoComprobante: number;
  resultado: "obtenido" | "no_disponible";
  ultimoAutorizado: string | null;
  codigos: CodigoArca[];
}
const mensajes: Record<string, string> = {
  "500": "WSFE informó un error interno de aplicación.",
  "501": "WSFE informó un error interno de base de datos.",
  "502": "WSFE informó una transacción activa del autorizador.",
  "600": "WSFE no confirmó token, firma o autorización para esta operación.",
  "601": "La CUIT representada no está incluida en el ticket de acceso.",
  "602": "La consulta de serie no devolvió datos.",
  "11000": "WSFE rechazó el formato o rango del punto de venta consultado.",
  "11001": "WSFE no admite el tipo de comprobante consultado.",
  "11002":
    "WSFE informó que el punto de venta no está habilitado para esta operación.",
};
const erroresTecnicos = new Set([
  "WSAA_CACHE_NO_VERIFICABLE",
  "WSAA_CERTIFICADO_AUN_NO_VIGENTE",
  "WSAA_CERTIFICADO_AUSENTE_EN_CMS",
  "WSAA_CERTIFICADO_INVALIDO",
  "WSAA_CERTIFICADO_NO_CONFIABLE",
  "WSAA_CERTIFICADO_VENCIDO",
  "WSAA_CMS_INVALIDO",
  "WSAA_CUSTODIA_NO_CONFIGURADA",
  "WSAA_EN_CURSO",
  "WSAA_FIRMA_INVALIDA",
  "WSAA_NO_AUTORIZADO",
  "WSAA_NO_DISPONIBLE",
  "WSAA_RECHAZO_NO_CLASIFICADO",
  "WSAA_RELOJ_INVALIDO",
  "WSAA_RESPUESTA_HTTP_INVALIDA",
  "WSAA_RESPUESTA_SOAP_INVALIDA",
  "WSAA_RETORNO_INVALIDO",
  "WSAA_SERVICIO_NO_ENCONTRADO",
  "WSAA_TA_CABECERA_INVALIDA",
  "WSAA_TA_CREDENCIALES_INVALIDAS",
  "WSAA_TA_DESTINO_NO_COINCIDE",
  "WSAA_TA_IDENTIFICADOR_INVALIDO",
  "WSAA_TA_ORIGEN_NO_VERIFICABLE",
  "WSAA_TA_VIGENCIA_INVALIDA",
  "WSAA_TA_XML_INVALIDO",
  "WSAA_TICKET_EXISTENTE",
  "WSAA_TRA_DESTINO_INVALIDO",
  "WSAA_TRA_INVALIDO",
  "WSAA_TRA_ORIGEN_INVALIDO",
  "WSAA_TRA_VERSION_NO_SOPORTADA",
  "ARCA_ULTIMO_NO_CONFIRMADO",
  "ARCA_ULTIMO_NO_DISPONIBLE",
]);
const sinConfirmar = (): CodigoArca[] => [{
  codigo: "WSFE_SERIE_NO_CONFIRMADA",
  mensaje: "No se confirmó la consulta de la serie. No se solicitó CAE.",
}];
function codigosPublicos(value: unknown): CodigoArca[] {
  if (!Array.isArray(value) || value.length > 30) return sinConfirmar();
  const codes = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return sinConfirmar();
    }
    const code = (item as Record<string, unknown>).codigo;
    if (
      typeof code !== "string" ||
      (!/^\d{1,8}$/.test(code) && !erroresTecnicos.has(code))
    ) {
      return sinConfirmar();
    }
    codes.add(code);
  }
  return codes.size
    ? [...codes].map((codigo) => ({
      codigo,
      mensaje: mensajes[codigo] ?? (erroresTecnicos.has(codigo)
        ? "No se confirmó el acceso o la respuesta técnica de la serie. Revisar el código antes de reintentar; no se solicitó CAE."
        : `WSFE informó el código ${codigo} al consultar la serie. Revisar su descripción oficial antes de corregir datos.`),
    }))
    : sinConfirmar();
}

/** Consulta exclusivamente numeración; no crea reserva, snapshot ni solicitud de CAE. */
export class ConsultarSerieFiscalUseCase {
  constructor(
    private puerto: Pick<PuertoArca, "obtenerUltimoAutorizado">,
  ) {}
  async ejecutar(
    club: ClubParaConsultaSerie,
    tipoComprobante: number,
  ): Promise<ConsultaSerieFiscalPublica> {
    if (typeof club.cuit !== "string") {
      throw new ContratoFiscalError(
        "La configuración institucional no tiene una CUIT válida.",
      );
    }
    const identidad = validarIdentidadFiscal({
      cuit: club.cuit.replaceAll("-", ""),
      puntoVenta: club.punto_venta,
      tipoComprobante,
      ambiente: "homologacion",
    });
    const base = {
      ambiente: "homologacion" as const,
      servicio: "wsfe" as const,
      operacion: "FECompUltimoAutorizado" as const,
      puntoVentaConfigurado: identidad.puntoVenta,
      tipoComprobante: identidad.tipoComprobante,
    };
    const result = await this.puerto.obtenerUltimoAutorizado(identidad);
    if (
      result?.tipo === "obtenido" && typeof result.numero === "string" &&
      /^(0|[1-9]\d{0,11})$/.test(result.numero)
    ) {
      return {
        ...base,
        resultado: "obtenido",
        ultimoAutorizado: result.numero,
        codigos: [],
      };
    }
    return {
      ...base,
      resultado: "no_disponible",
      ultimoAutorizado: null,
      codigos: result?.tipo === "no_disponible"
        ? codigosPublicos(result.codigos)
        : sinConfirmar(),
    };
  }
}
