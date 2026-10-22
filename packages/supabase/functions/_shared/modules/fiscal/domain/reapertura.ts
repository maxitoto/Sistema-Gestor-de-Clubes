// contiene los datos mínimos y la regla de bloqueo

export type ComprobanteReapertura = {
  id: string;
  estado_fiscal: string;
  numero_solicitado: string | null;
};

export type BloqueoReapertura =
  | "no_fallido"
  | "conciliacion_pendiente";

export function obtenerBloqueoReapertura(
  comprobante: ComprobanteReapertura,
): BloqueoReapertura | null {
  if (comprobante.estado_fiscal !== "fallido") {
    return "no_fallido";
  }

  if (comprobante.numero_solicitado !== null) {
    return "conciliacion_pendiente";
  }

  return null;
}