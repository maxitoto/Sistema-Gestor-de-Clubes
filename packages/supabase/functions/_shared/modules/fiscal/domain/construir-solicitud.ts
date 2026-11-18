import { ContratoFiscalError } from "./identidad-fiscal.ts";
import type { ContextoFiscal } from "./intento-fiscal.ts";
import {
  centavosFiscales,
  type DetalleFiscal,
  type SolicitudFiscal,
  validarSolicitudFiscal,
} from "./solicitud-fiscal.ts";

const decimal = (centavos: bigint) =>
  `${centavos / 100n}.${(centavos % 100n).toString().padStart(2, "0")}`;
function fechaClub(instant: string): string {
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) {
    throw new ContratoFiscalError("La fecha del cobro no es válida.");
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"].map((type) =>
    parts.find((p) => p.type === type)?.value ?? ""
  ).join("");
}
/** El perfil es una decisión tributaria explícita; no se deriva del nombre del club. */
export function construirSolicitudFiscal(
  ctx: ContextoFiscal,
  numero: string,
  ahora: Date = new Date(),
): SolicitudFiscal {
  const config = ctx.configuracion, receptor = ctx.receptor;
  if (ctx.comprobante.tipo === "nota_credito") {
    return construirNotaCredito(ctx, numero, ahora);
  }
  if (!config?.confirmado || !receptor?.confirmado) {
    throw new ContratoFiscalError(
      "Falta confirmar la configuración fiscal del club y del receptor.",
    );
  }
  if (ctx.comprobante.tipo !== "factura" || ctx.pago.estado !== "completado") {
    throw new ContratoFiscalError(
      "La emisión inicial sólo admite la factura de un cobro confirmado.",
    );
  }
  if (
    config.ambiente !== "homologacion" || config.moneda !== "PES" ||
    config.cotizacion !== "1.000000"
  ) {
    throw new ContratoFiscalError(
      "Los importes locales requieren el perfil confirmado PES con cotización1.000000.",
    );
  }
  const total = centavosFiscales(ctx.pago.monto);
  let neto = 0n, exento = 0n, noGravado = 0n, iva = 0n;
  const perfil = config.perfil_importes;
  if (perfil.modo === "neto_sin_iva") neto = total;
  else if (perfil.modo === "exento") exento = total;
  else if (perfil.modo === "no_gravado") noGravado = total;
  else if (perfil.modo === "iva_incluido") {
    if (!/^\d{1,3}\.\d{2}$/.test(perfil.porcentajeIva)) {
      throw new ContratoFiscalError(
        "La alícuota requiere un porcentaje explícito de dos decimales.",
      );
    }
    const porcentaje = BigInt(perfil.porcentajeIva.replace(".", ""));
    const divisor = 10000n + porcentaje;
    neto = (total * 10000n + divisor / 2n) / divisor;
    iva = total - neto;
  }
  const fecha = fechaClub(ahora.toISOString());
  const detalle: DetalleFiscal = {
    Concepto: config.concepto,
    DocTipo: receptor.doc_tipo,
    DocNro: receptor.doc_numero,
    CondicionIVAReceptorId: receptor.condicion_iva_id,
    CbteDesde: numero,
    CbteHasta: numero,
    CbteFch: fecha,
    ImpTotal: decimal(total),
    ImpTotConc: decimal(noGravado),
    ImpNeto: decimal(neto),
    ImpOpEx: decimal(exento),
    ImpTrib: "0.00",
    ImpIVA: decimal(iva),
    MonId: config.moneda,
    MonCotiz: config.cotizacion,
  };
  if (perfil.modo === "iva_incluido") {
    detalle.Iva = [{
      Id: perfil.ivaId,
      BaseImp: decimal(neto),
      Importe: decimal(iva),
    }];
  }
  if (config.concepto === 2 || config.concepto === 3) {
    if (!config.usar_periodo_cuota) {
      throw new ContratoFiscalError(
        "El perfil de servicios debe confirmar el período de la cuota.",
      );
    }
    const year = ctx.cuota.periodo_anio, month = ctx.cuota.periodo_mes;
    if (
      !Number.isInteger(year) || year < 2001 || year > 9999 ||
      !Number.isInteger(month) || month < 1 || month > 12
    ) throw new ContratoFiscalError("El período de servicio no es válido.");
    const prefix = `${year}${String(month).padStart(2, "0")}`;
    detalle.FchServDesde = prefix + "01";
    detalle.FchServHasta = prefix +
      String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0");
    detalle.FchVtoPago =
      config.vencimiento_pago === "fin_periodo" && detalle.FchServHasta > fecha
        ? detalle.FchServHasta
        : fecha;
  }
  return validarSolicitudFiscal({
    version: 1,
    identidad: {
      cuit: ctx.club.cuit.replace(/-/g, ""),
      ambiente: config.ambiente,
      puntoVenta: ctx.comprobante.punto_venta,
      tipoComprobante: config.tipo_factura,
    },
    emisor: { nombre: ctx.club.nombre, domicilio: ctx.club.domicilio_fiscal },
    receptor: {
      nombre: `${ctx.socio.nombre} ${ctx.socio.apellido}`.trim(),
      ...(ctx.socio.direccion?.trim()
        ? { domicilio: ctx.socio.direccion.trim() }
        : {}),
    },
    detalle,
  });
}

/** La NC conserva emisor/receptor/importes del original autorizado; no usa datos editables actuales. */
function construirNotaCredito(
  ctx: ContextoFiscal,
  numero: string,
  ahora: Date,
): SolicitudFiscal {
  const o = ctx.origen, config = ctx.configuracion;
  if (
    ctx.pago.estado !== "anulado" || !config?.confirmado ||
    !config.tipo_nota_credito || config.tipo_nota_credito === config.tipo_factura || !o ||
    o.id !== ctx.comprobante.comprobante_origen_id ||
    o.pago_id !== ctx.pago.id || o.tipo !== "factura" ||
    o.estado_fiscal !== "anulacion_pendiente" || !o.solicitud_fiscal ||
    !o.cae || !o.numero_comprobante || !o.emisor_cuit || !o.tipo_fiscal ||
    o.ambiente_fiscal !== "homologacion"
  ) {
    throw new ContratoFiscalError(
      "La Nota de Crédito requiere pago anulado, factura original autorizada y tipo fiscal confirmado.",
    );
  }
  const original = validarSolicitudFiscal(o.solicitud_fiscal);
  if (
    original.identidad.cuit !== o.emisor_cuit ||
    original.identidad.ambiente !== o.ambiente_fiscal ||
    original.identidad.puntoVenta !== o.punto_venta ||
    original.identidad.tipoComprobante !== o.tipo_fiscal ||
    original.detalle.CbteDesde !== o.numero_comprobante ||
    original.detalle.ImpTotal !== ctx.pago.monto
  ) {
    throw new ContratoFiscalError(
      "La factura original no conserva una identidad fiscal verificable.",
    );
  }
  const fecha = fechaClub(ahora.toISOString());
  const detalle = structuredClone(original.detalle);
  detalle.CbteDesde = numero;
  detalle.CbteHasta = numero;
  detalle.CbteFch = fecha;
  if (detalle.FchVtoPago && detalle.FchVtoPago < fecha) {
    detalle.FchVtoPago = fecha;
  }
  detalle.CbtesAsoc = [{
    Tipo: o.tipo_fiscal,
    PtoVta: o.punto_venta,
    Nro: o.numero_comprobante,
    Cuit: o.emisor_cuit,
    CbteFch: original.detalle.CbteFch,
  }];
  return validarSolicitudFiscal({
    version: 1,
    identidad: {
      ...original.identidad,
      tipoComprobante: config.tipo_nota_credito,
    },
    emisor: original.emisor,
    receptor: original.receptor,
    detalle,
  });
}
