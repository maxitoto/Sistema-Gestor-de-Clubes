// deno-lint-ignore-file require-await
// Los dobles conservan puertos Promise sin inventar operaciones de I/O.
import type {
  ContextoFiscal,
  EjecucionFiscal,
} from "../../functions/_shared/modules/fiscal/domain/intento-fiscal.ts";
import type { RepositorioRegularizacionFiscal } from "../../functions/_shared/modules/fiscal/application/RepositorioRegularizacionFiscal.ts";
import type {
  AutorizacionArca,
  PuertoArca,
} from "../../functions/_shared/modules/fiscal/application/PuertoArca.ts";
import { construirSolicitudFiscal } from "../../functions/_shared/modules/fiscal/domain/construir-solicitud.ts";
export const id = "60000000-0000-0000-0000-000000000001",
  actor = "60000000-0000-0000-0000-000000000002",
  inicio = "2026-10-25T03:00:00.000Z";
export function contexto(): ContextoFiscal {
  return {
    comprobante: {
      id,
      pago_id: id,
      tipo: "factura",
      punto_venta: 1,
      estado_fiscal: "pendiente_cae",
      numero_comprobante: null,
      cae: null,
      cae_vencimiento: null,
      numero_solicitado: null,
      solicitud_fiscal: null,
      pdf_url: null,
      created_at: inicio,
      updated_at: inicio,
    },
    pago: {
      id,
      cuota_id: id,
      usuario_id: actor,
      monto: "121.00",
      fecha_pago: inicio,
      estado: "completado",
      medio_pago: "efectivo",
      referencia_pago: null,
    },
    cuota: {
      id,
      socio_id: id,
      categoria_id: id,
      periodo_mes: 10,
      periodo_anio: 2026,
    },
    socio: {
      id,
      nombre: "SOCIO",
      apellido: "SIMULACION",
      dni: "30000001",
      direccion: null,
    },
    club: {
      id,
      nombre: "Club sintético",
      cuit: "30-00000000-7",
      domicilio_fiscal: "Calle sintética",
      punto_venta: 1,
      email_contacto: "club@example.test",
      logo_storage_path: null,
    },
    configuracion: {
      ambiente: "homologacion",
      tipo_factura: 11,
      tipo_nota_credito: 13,
      concepto: 1,
      moneda: "PES",
      cotizacion: "1.000000",
      perfil_importes: {
        modo: "iva_incluido",
        ivaId: 5,
        porcentajeIva: "21.00",
      },
      usar_periodo_cuota: false,
      vencimiento_pago: "fecha_comprobante",
      confirmado: true,
    },
    receptor: {
      doc_tipo: 96,
      doc_numero: "30000001",
      condicion_iva_id: 5,
      confirmado: true,
    },
    ejecucion: null,
  };
}
export function ejecucion(
  ctx = contexto(),
  estado: EjecucionFiscal["estado"] = "desconocido",
): EjecucionFiscal {
  const s = construirSolicitudFiscal(ctx, "1", new Date(inicio));
  return {
    id,
    comprobanteId: id,
    serieId: id,
    version: "1",
    estado,
    identidad: s.identidad,
    numero: "1",
    solicitud: s,
    posibleEnvio: true,
    resultado: null,
    iniciadoEn: inicio,
    cerradoEn: null,
  };
}
export function autorizacion(e: EjecucionFiscal): AutorizacionArca {
  const d = e.solicitud!.detalle;
  return {
    identidad: e.identidad,
    numero: d.CbteDesde,
    cae: "90000000000001",
    vencimiento: "2026-11-04",
    fecha: d.CbteFch,
    docTipo: d.DocTipo,
    docNro: d.DocNro,
    concepto: d.Concepto,
    moneda: d.MonId,
    cotizacion: d.MonCotiz,
    importeTotal: d.ImpTotal,
    importeNeto: d.ImpNeto,
    importeNoGravado: d.ImpTotConc,
    importeExento: d.ImpOpEx,
    importeIva: d.ImpIVA,
    importeTributos: d.ImpTrib,
    detalle: d,
  };
}
export function fake(ctx = contexto()) {
  const calls: string[] = [];
  let e = ctx.ejecucion;
  const repo = {
    leerContexto: async () => structuredClone({ ...ctx, ejecucion: e }),
    consultar: async () => e,
    iniciar: async (_id: string, modo: string) => {
      calls.push("iniciar:" + modo);
      if (!e) {
        return {
          estado: "no_elegible",
          motivo: "Bloqueado en fixture",
          ejecucion: null,
        };
      }
      return { estado: "conciliacion", motivo: null, ejecucion: e };
    },
    expirar: async () => {
      calls.push("expirar");
      return { expirado: false };
    },
    resolverSinEnvio: async () => {
      calls.push("resolver_sin_envio");
      return { resuelto: false };
    },
    resolverRechazoAnulado: async () => {
      calls.push("resolver_rechazo_anulado");
      return { resuelto: true };
    },
    reabrirVerificado: async () => {
      calls.push("reabrir");
      return { reabierto: true };
    },
    reabrirSinEnvio: async () => {
      calls.push("reabrir_sin_envio");
      return { reabierto: true };
    },
    registrarAutorizacion: async () => {
      calls.push("registrar");
      return { ...e!, estado: "autorizado" };
    },
    confirmar: async (_id: string, _v: string, result: { tipo: string }) => {
      calls.push("confirmar:" + result.tipo);
      e = { ...e!, estado: result.tipo as EjecucionFiscal["estado"] };
      return e;
    },
    resolverAnulacion: async (
      _id: string,
      _v: string,
      result: { tipo: string },
    ) => {
      calls.push("resolver:" + result.tipo);
      return { ...e!, estado: result.tipo };
    },
    listarCandidatos: async () => ({ candidatos: [], hayMas: false }),
  } as unknown as RepositorioRegularizacionFiscal;
  const arca = {
    consultar: async () => ({ tipo: "no_encontrado", codigos: [] }),
    diagnosticar: async () => {
      throw new Error("Sin red de negocio en fixture");
    },
    solicitar: async () => {
      calls.push("ENVIO_NO_ESPERADO");
      throw new Error("Nunca");
    },
  } as unknown as PuertoArca;
  return { ctx, repo, arca, calls };
}
export function contextoNc() {
  const c = contexto(), s = construirSolicitudFiscal(c, "15", new Date(inicio));
  c.pago.estado = "anulado";
  c.comprobante.tipo = "nota_credito";
  c.comprobante.comprobante_origen_id = actor;
  c.origen = {
    id: actor,
    pago_id: id,
    tipo: "factura",
    estado_fiscal: "anulacion_pendiente",
    emisor_cuit: s.identidad.cuit,
    ambiente_fiscal: s.identidad.ambiente,
    tipo_fiscal: s.identidad.tipoComprobante,
    punto_venta: 1,
    numero_comprobante: "15",
    cae: "90000000000001",
    cae_vencimiento: "2026-11-04",
    solicitud_fiscal: s,
  };
  return c;
}
