import type { ResultadoSolicitudArca } from "./resultado-arca.ts";
import {
  ContratoFiscalError,
  type IdentidadFiscal,
  objetoCerrado,
  validarIdentidadFiscal,
} from "./identidad-fiscal.ts";
import {
  type SolicitudFiscal,
  validarSolicitudFiscal,
} from "./solicitud-fiscal.ts";

export type MotivoIncidenciaFiscal =
  | "numero_ocupado"
  | "consulta_incompatible"
  | "ausencia_no_concluyente"
  | "pago_cambio";
export type ModoEjecucionFiscal =
  | "inicial"
  | "conciliacion"
  | "manual"
  | "automatico";
export type EstadoEjecucionFiscal =
  | "adquirida"
  | "preparada"
  | "posible_envio"
  | "desconocido"
  | "autorizado"
  | "rechazado"
  | "transitorio"
  | "incidencia";
export interface EjecucionFiscal {
  id: string;
  comprobanteId: string;
  serieId: string;
  version: string;
  estado: EstadoEjecucionFiscal;
  identidad: IdentidadFiscal;
  numero: string | null;
  solicitud: SolicitudFiscal | null;
  posibleEnvio: boolean;
  resultado: ResultadoSolicitudArca | null;
  iniciadoEn: string;
  cerradoEn: string | null;
}
export interface AdquisicionFiscal {
  estado:
    | "adquirida"
    | "conciliacion"
    | "en_curso"
    | "no_elegible"
    | "finalizada"
    | "pendiente_configuracion";
  motivo: string | null;
  ejecucion: EjecucionFiscal | null;
}
export type PerfilImportesFiscal =
  | { modo: "neto_sin_iva" | "exento" | "no_gravado" }
  | { modo: "iva_incluido"; ivaId: number; porcentajeIva: string };
export interface ConfiguracionFiscalDurable {
  ambiente: "homologacion";
  tipo_factura: number;
  tipo_nota_credito?: number | null;
  concepto: 1 | 2 | 3;
  moneda: string;
  cotizacion: string;
  perfil_importes: PerfilImportesFiscal;
  usar_periodo_cuota: boolean;
  vencimiento_pago: "fecha_comprobante" | "fin_periodo";
  confirmado: boolean;
}
export interface ContextoFiscal {
  comprobante: {
    id: string;
    pago_id: string;
    comprobante_origen_id?: string | null;
    ventana_regularizacion_iniciada_en?: string | null;
    intentos_reintento?: number;
    proximo_reintento_en?: string | null;
    detalle_error_fiscal?: string | null;
    tipo: string;
    punto_venta: number;
    estado_fiscal: string;
    numero_comprobante: string | null;
    cae: string | null;
    cae_vencimiento: string | null;
    numero_solicitado: string | null;
    solicitud_fiscal: SolicitudFiscal | null;
    pdf_url: string | null;
    created_at: string;
    updated_at: string;
  };
  pago: {
    id: string;
    cuota_id: string;
    usuario_id: string;
    monto: string;
    fecha_pago: string;
    estado: string;
    medio_pago: string;
    referencia_pago: string | null;
  };
  cuota: {
    id: string;
    socio_id: string;
    categoria_id: string;
    periodo_mes: number;
    periodo_anio: number;
  };
  socio: {
    id: string;
    nombre: string;
    apellido: string;
    dni: string;
    direccion: string | null;
  };
  club: {
    id: string;
    nombre: string;
    cuit: string;
    domicilio_fiscal: string;
    punto_venta: number;
    email_contacto: string;
    logo_storage_path: string | null;
  };
  configuracion: ConfiguracionFiscalDurable | null;
  receptor: {
    doc_tipo: number;
    doc_numero: string;
    condicion_iva_id: number;
    confirmado: boolean;
  } | null;
  ejecucion: EjecucionFiscal | null;
  notaCreditoId?: string | null;
  origen?: {
    id: string;
    pago_id: string;
    tipo: string;
    estado_fiscal: string;
    emisor_cuit: string | null;
    ambiente_fiscal: string | null;
    tipo_fiscal: number | null;
    punto_venta: number;
    numero_comprobante: string | null;
    cae: string | null;
    cae_vencimiento: string | null;
    solicitud_fiscal: SolicitudFiscal | null;
  } | null;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown): value is string => typeof value === "string";
const nullableText = (value: unknown) => value === null || text(value);
export function parseEjecucionFiscal(value: unknown): EjecucionFiscal {
  const row = objetoCerrado(value, [
    "id",
    "comprobanteId",
    "serieId",
    "version",
    "estado",
    "identidad",
    "numero",
    "solicitud",
    "posibleEnvio",
    "resultado",
    "iniciadoEn",
    "cerradoEn",
  ]);
  if (
    ![row.id, row.comprobanteId, row.serieId].every((v) =>
      text(v) && UUID.test(v)
    ) || !text(row.version) || !(/^[1-9]\d*$/.test(row.version)) ||
    !text(row.estado) ||
    !([
      "adquirida",
      "preparada",
      "posible_envio",
      "desconocido",
      "autorizado",
      "rechazado",
      "transitorio",
      "incidencia",
    ].includes(row.estado)) || !nullableText(row.numero) ||
    typeof row.posibleEnvio !== "boolean" || !text(row.iniciadoEn) ||
    !nullableText(row.cerradoEn)
  ) {
    throw new ContratoFiscalError(
      "La ejecución fiscal persistida no es válida.",
    );
  }
  validarIdentidadFiscal(row.identidad);
  if (row.solicitud !== null) validarSolicitudFiscal(row.solicitud);
  if (row.resultado !== null) {
    const result = objetoCerrado(row.resultado, ["tipo"], [
      "autorizacion",
      "observaciones",
      "codigos",
    ]);
    if (
      !text(result.tipo) ||
      !["autorizado", "rechazado", "transitorio", "desconocido"].includes(
        result.tipo,
      )
    ) throw new ContratoFiscalError("El resultado persistido no es válido.");
  }
  return structuredClone(row) as unknown as EjecucionFiscal;
}
export function parseAdquisicionFiscal(value: unknown): AdquisicionFiscal {
  const row = objetoCerrado(value, ["estado", "motivo", "ejecucion"]);
  if (
    !text(row.estado) ||
    ![
      "adquirida",
      "conciliacion",
      "en_curso",
      "no_elegible",
      "finalizada",
      "pendiente_configuracion",
    ].includes(row.estado) || !nullableText(row.motivo)
  ) throw new ContratoFiscalError("La adquisición fiscal no es válida.");
  if (row.ejecucion !== null) parseEjecucionFiscal(row.ejecucion);
  return structuredClone(row) as unknown as AdquisicionFiscal;
}
export function parseContextoFiscal(value: unknown): ContextoFiscal | null {
  if (value === null) return null;
  const row = objetoCerrado(value, [
    "comprobante",
    "pago",
    "cuota",
    "socio",
    "club",
    "configuracion",
    "receptor",
    "ejecucion",
  ], ["origen", "notaCreditoId"]);
  const cbte = objetoCerrado(row.comprobante, [
    "id",
    "pago_id",
    "tipo",
    "punto_venta",
    "estado_fiscal",
    "numero_comprobante",
    "cae",
    "cae_vencimiento",
    "numero_solicitado",
    "solicitud_fiscal",
    "pdf_url",
    "created_at",
    "updated_at",
  ], [
    "comprobante_origen_id",
    "ventana_regularizacion_iniciada_en",
    "intentos_reintento",
    "proximo_reintento_en",
    "detalle_error_fiscal",
  ]);
  if (
    cbte.intentos_reintento !== undefined &&
    (!Number.isSafeInteger(cbte.intentos_reintento) ||
      Number(cbte.intentos_reintento) < 0 ||
      Number(cbte.intentos_reintento) > 6)
  ) throw new ContratoFiscalError("El contador fiscal no es válido.");
  for (
    const name of [
      "comprobante_origen_id",
      "ventana_regularizacion_iniciada_en",
      "proximo_reintento_en",
      "detalle_error_fiscal",
    ]
  ) {
    if (cbte[name] !== undefined && !nullableText(cbte[name])) {
      throw new ContratoFiscalError(
        "La regularización persistida no es válida.",
      );
    }
  }
  if (
    row.notaCreditoId !== undefined && row.notaCreditoId !== null &&
    (!text(row.notaCreditoId) || !UUID.test(row.notaCreditoId))
  ) throw new ContratoFiscalError("El vínculo documental no es válido.");
  if (row.origen !== undefined && row.origen !== null) {
    const o = objetoCerrado(row.origen, [
      "id",
      "pago_id",
      "tipo",
      "estado_fiscal",
      "emisor_cuit",
      "ambiente_fiscal",
      "tipo_fiscal",
      "punto_venta",
      "numero_comprobante",
      "cae",
      "cae_vencimiento",
      "solicitud_fiscal",
    ]);
    if (
      ![o.id, o.pago_id].every((v) => text(v) && UUID.test(v)) ||
      o.tipo !== "factura" || !text(o.estado_fiscal) ||
      !Number.isSafeInteger(o.punto_venta) ||
      (o.tipo_fiscal !== null && !Number.isSafeInteger(o.tipo_fiscal)) ||
      ![
        o.emisor_cuit,
        o.ambiente_fiscal,
        o.numero_comprobante,
        o.cae,
        o.cae_vencimiento,
      ].every(nullableText)
    ) throw new ContratoFiscalError("El origen fiscal no es válido.");
    if (o.solicitud_fiscal !== null) validarSolicitudFiscal(o.solicitud_fiscal);
  }
  const pago = objetoCerrado(row.pago, [
    "id",
    "cuota_id",
    "usuario_id",
    "monto",
    "fecha_pago",
    "estado",
    "medio_pago",
    "referencia_pago",
  ]);
  const cuota = objetoCerrado(row.cuota, [
    "id",
    "socio_id",
    "categoria_id",
    "periodo_mes",
    "periodo_anio",
  ]);
  const socio = objetoCerrado(row.socio, [
    "id",
    "nombre",
    "apellido",
    "dni",
    "direccion",
  ]);
  const club = objetoCerrado(row.club, [
    "id",
    "nombre",
    "cuit",
    "domicilio_fiscal",
    "punto_venta",
    "email_contacto",
    "logo_storage_path",
  ]);
  if (
    ![
      cbte.id,
      cbte.pago_id,
      pago.id,
      pago.cuota_id,
      pago.usuario_id,
      cuota.id,
      cuota.socio_id,
      cuota.categoria_id,
      socio.id,
      club.id,
    ].every((v) => text(v) && UUID.test(v)) ||
    ![
      pago.monto,
      pago.fecha_pago,
      pago.estado,
      pago.medio_pago,
      socio.nombre,
      socio.apellido,
      socio.dni,
      club.nombre,
      club.cuit,
      club.domicilio_fiscal,
      club.email_contacto,
      cbte.tipo,
      cbte.estado_fiscal,
      cbte.created_at,
      cbte.updated_at,
    ].every(text) ||
    ![
      pago.referencia_pago,
      socio.direccion,
      club.logo_storage_path,
      cbte.numero_comprobante,
      cbte.cae,
      cbte.cae_vencimiento,
      cbte.numero_solicitado,
      cbte.pdf_url,
    ].every(nullableText) ||
    ![cbte.punto_venta, club.punto_venta, cuota.periodo_mes, cuota.periodo_anio]
      .every(Number.isSafeInteger)
  ) {
    throw new ContratoFiscalError(
      "El contexto fiscal persistido no es válido.",
    );
  }
  if (cbte.solicitud_fiscal !== null) {
    validarSolicitudFiscal(cbte.solicitud_fiscal);
  }
  if (row.ejecucion !== null) parseEjecucionFiscal(row.ejecucion);
  if (row.configuracion !== null) {
    const c = objetoCerrado(row.configuracion, [
      "ambiente",
      "tipo_factura",
      "concepto",
      "moneda",
      "cotizacion",
      "perfil_importes",
      "usar_periodo_cuota",
      "vencimiento_pago",
      "confirmado",
    ], ["tipo_nota_credito"]);
    if (
      c.tipo_nota_credito !== undefined && c.tipo_nota_credito !== null &&
      (!Number.isSafeInteger(c.tipo_nota_credito) ||
        Number(c.tipo_nota_credito) < 1 || Number(c.tipo_nota_credito) > 999)
    ) {
      throw new ContratoFiscalError(
        "El tipo de Nota de Crédito requiere confirmación explícita.",
      );
    }
    if (
      c.ambiente !== "homologacion" ||
      ![c.tipo_factura, c.concepto].every(Number.isSafeInteger) ||
      !text(c.moneda) || !text(c.cotizacion) ||
      typeof c.usar_periodo_cuota !== "boolean" ||
      typeof c.confirmado !== "boolean" ||
      !["fecha_comprobante", "fin_periodo"].includes(String(c.vencimiento_pago))
    ) throw new ContratoFiscalError("La configuración fiscal no es válida.");
    const p = objetoCerrado(c.perfil_importes, ["modo"], [
      "ivaId",
      "porcentajeIva",
    ]);
    if (
      !["neto_sin_iva", "exento", "no_gravado", "iva_incluido"].includes(
        String(p.modo),
      ) ||
      (p.modo === "iva_incluido" &&
        (!Number.isSafeInteger(p.ivaId) || !text(p.porcentajeIva)))
    ) throw new ContratoFiscalError("El perfil de importes no es válido.");
  }
  if (row.receptor !== null) {
    const receptor = objetoCerrado(row.receptor, [
      "doc_tipo",
      "doc_numero",
      "condicion_iva_id",
      "confirmado",
    ]);
    if (
      ![receptor.doc_tipo, receptor.condicion_iva_id].every(
        Number.isSafeInteger,
      ) || !text(receptor.doc_numero) ||
      typeof receptor.confirmado !== "boolean"
    ) throw new ContratoFiscalError("El receptor fiscal no es válido.");
  }
  return structuredClone(row) as unknown as ContextoFiscal;
}
