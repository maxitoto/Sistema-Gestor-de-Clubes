import type { ContextoFiscal } from "../domain/intento-fiscal.ts";
/** Proyección operativa; ninguna credencial o snapshot sale al navegador. */
export function estadoFiscalPublico(ctx: ContextoFiscal, externo: boolean) {
  const cb = ctx.comprobante, ex = ctx.ejecucion;
  const nc = cb.tipo === "nota_credito",
    pagado = ctx.pago.estado === "completado",
    anulado = ctx.pago.estado === "anulado";
  const factura = cb.tipo === "factura";
  const confirmar = Boolean(
    ctx.configuracion?.confirmado &&
      (nc
        ? ctx.configuracion.tipo_nota_credito && ctx.origen?.cae &&
          ctx.origen.pago_id === cb.pago_id
        : ctx.receptor?.confirmado),
  );
  const incierto = Boolean(
    ex && ["posible_envio", "desconocido", "incidencia"].includes(ex.estado),
  );
  const terminal = Boolean(
    ex && ["transitorio", "incidencia", "rechazado"].includes(ex.estado),
  );
  let aviso: string | null = null;
  if (factura && anulado) {
    aviso = cb.cae
      ? "La anulación financiera está confirmada. Consultá la Nota de Crédito relacionada y su estado; la factura original no vuelve a emitirse."
      : cb.estado_fiscal === "anulacion_pendiente"
      ? "La anulación financiera está confirmada y la factura espera resolución administrativa. No se vuelve a cobrar ni a emitir el original."
      : "El cobro fue anulado localmente, sin Nota de Crédito porque no hubo autorización fiscal confirmada.";
  } else if (!((factura && pagado) || (nc && anulado))) {
    aviso =
      "El estado del cobro requiere revisión antes de operar su documento.";
  } else if (nc && cb.estado_fiscal === "anulado" && cb.cae) {
    aviso =
      "La Nota de Crédito está autorizada. La resolución fiscal conserva la anulación y cualquier recobro posterior de la cuota.";
  } else if (incierto) {
    aviso =
      "Hay un intento fiscal pendiente de conciliación. Administración debe consultar su resultado desde Monitoreo fiscal; no registres otro cobro.";
  } else if (terminal) {
    aviso =
      "La operación fiscal requiere regularización administrativa desde Monitoreo fiscal. El estado financiero no se modifica.";
  } else if (!externo && cb.estado_fiscal !== "valido") {
    aviso = nc
      ? "La conexión de homologación está pendiente de habilitación. La Nota de Crédito sigue pendiente; la anulación financiera ya está confirmada."
      : "La conexión de homologación está pendiente de habilitación. El cobro sigue confirmado y podés obtener su comprobante provisional.";
  } else if (!confirmar && cb.estado_fiscal !== "valido") {
    aviso = nc
      ? "Falta confirmar el código fiscal de Nota de Crédito y verificar la factura original."
      : "Falta completar y confirmar la configuración fiscal del emisor y del receptor.";
  }
  const documentoAutorizado = Boolean(
    cb.cae &&
      ["valido", "anulacion_pendiente", "anulado"].includes(cb.estado_fiscal),
  );
  const documentoDisponible = (factura && (pagado || anulado)) ||
    (nc && anulado);
  return {
    comprobanteId: cb.id,
    pagoId: cb.pago_id,
    cobroConfirmado: pagado,
    estadoFiscal: cb.estado_fiscal,
    numero: cb.numero_comprobante,
    cae: cb.cae,
    vencimiento: cb.cae_vencimiento,
    operacion: ex?.estado ?? null,
    emisionDisponible: externo && !ex && confirmar &&
      cb.estado_fiscal === "pendiente_cae" &&
      ((factura && pagado) || (nc && anulado)),
    aviso,
    pdfVersion: documentoDisponible
      ? documentoAutorizado ? "autorizado" as const : [
          "pendiente_cae",
          "fallido",
          ...(factura && anulado ? ["anulacion_pendiente", "anulado"] : []),
        ].includes(cb.estado_fiscal)
        ? "provisional" as const
        : null
      : null,
    tipoDocumento: nc ? "nota_credito" as const : "factura" as const,
    comprobanteOrigenId: cb.comprobante_origen_id ?? null,
    notaCreditoId: ctx.notaCreditoId ?? null,
  };
}
