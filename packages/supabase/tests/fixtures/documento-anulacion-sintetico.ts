import type { FuenteDocumento } from "../../functions/_shared/modules/fiscal/application/PuertoDocumentos.ts";
import { fuenteDocumento, solicitudDocumento } from "./documento-sintetico.ts";
export function fuenteConstanciaAnulacion(autorizada = false): FuenteDocumento {
  const source = fuenteDocumento(autorizada);
  source.estadoFiscal = autorizada ? "anulacion_pendiente" : "anulado";
  source.pago.estado = "anulado";
  source.anulacion = {
    fecha: "2026-10-25T18:00:00Z",
    motivo: "Corrección de cobro erróneo - Prueba sintética de anulación",
  };
  return source;
}
export function fuenteNotaCredito(autorizada = false): FuenteDocumento {
  const original = fuenteDocumento(true), source = fuenteConstanciaAnulacion();
  source.comprobanteId = "33333333-3333-3333-3333-333333333333";
  source.tipo = "nota_credito";
  source.estadoFiscal = autorizada ? "anulado" : "pendiente_cae";
  source.original = {
    id: original.comprobanteId,
    pagoId: original.pagoId,
    numero: original.numero,
    puntoVenta: original.puntoVenta,
    tipoFiscal: 11,
    cuit: "30000000007",
    cae: original.cae,
    solicitud: solicitudDocumento(),
  };
  if (autorizada) {
    const snapshot = solicitudDocumento();
    snapshot.identidad.tipoComprobante = 13;
    snapshot.detalle.CbteDesde = "5";
    snapshot.detalle.CbteHasta = "5";
    snapshot.detalle.CbteFch = "20261025";
    snapshot.detalle.CbtesAsoc = [{
      Tipo: 11,
      PtoVta: 7,
      Nro: "42",
      Cuit: "30000000007",
    }];
    source.solicitud = snapshot;
    source.numero = "5";
    source.cae = "90000000000002";
    source.vencimiento = "2026-11-04";
  }
  return source;
}
