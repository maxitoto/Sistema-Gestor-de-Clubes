import type { FuenteDocumento } from "../../functions/_shared/modules/fiscal/application/PuertoDocumentos.ts";
import type { SolicitudFiscal } from "../../functions/_shared/modules/fiscal/domain/solicitud-fiscal.ts";
export function solicitudDocumento(): SolicitudFiscal {
  return {
    version: 1,
    identidad: {
      cuit: "30000000007",
      ambiente: "homologacion",
      puntoVenta: 7,
      tipoComprobante: 11,
    },
    emisor: {
      nombre: "Club Sintético de Homologación",
      domicilio: "Calle de Prueba 123 - Datos ficticios",
    },
    receptor: {
      nombre: "Persona Sintética de Prueba",
      domicilio: "Domicilio de prueba 456",
    },
    detalle: {
      Concepto: 2,
      DocTipo: 96,
      DocNro: "40000000",
      CondicionIVAReceptorId: 5,
      CbteDesde: "42",
      CbteHasta: "42",
      CbteFch: "20261024",
      ImpTotal: "1000.00",
      ImpTotConc: "0.00",
      ImpNeto: "0.00",
      ImpOpEx: "1000.00",
      ImpTrib: "0.00",
      ImpIVA: "0.00",
      MonId: "PES",
      MonCotiz: "1.000000",
      FchServDesde: "20261001",
      FchServHasta: "20261031",
      FchVtoPago: "20261110",
    },
  };
}
export function fuenteDocumento(autorizada = false): FuenteDocumento {
  return {
    comprobanteId: "11111111-1111-1111-1111-111111111111",
    pagoId: "22222222-2222-2222-2222-222222222222",
    tipo: "factura",
    estadoFiscal: autorizada ? "valido" : "pendiente_cae",
    puntoVenta: 7,
    numero: autorizada ? "42" : null,
    cae: autorizada ? "70417054367476" : null,
    vencimiento: autorizada ? "2026-11-03" : null,
    solicitud: autorizada ? solicitudDocumento() : null,
    actualizadoEn: "2026-10-24T21:00:00Z",
    pago: {
      estado: "completado",
      importe: "1000.00",
      fecha: "2026-10-24T21:00:00Z",
      medio: "efectivo",
    },
    club: {
      nombre: "Club Sintético de Homologación",
      cuit: "30000000007",
      domicilio: "Calle Local 100 - Datos ficticios",
    },
    socio: { nombre: "Persona Sintética, Socia", documento: "40000000" },
    concepto: "Actividad sintética - Categoría de prueba",
    periodo: "10/2026",
  };
}
