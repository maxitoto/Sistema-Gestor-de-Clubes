// deno-lint-ignore-file require-await
// Los dobles conservan puertos Promise sin inventar operaciones de I/O.
import { describe, expect, test } from "bun:test";
import {
  calendarioRegularizacion,
  MINUTOS_REGULARIZACION,
} from "../functions/_shared/modules/fiscal/domain/calendario-regularizacion.ts";
import { construirSolicitudFiscal } from "../functions/_shared/modules/fiscal/domain/construir-solicitud.ts";
import { RegularizarComprobanteUseCase } from "../functions/_shared/modules/fiscal/application/RegularizarComprobanteUseCase.ts";
import { ReabrirRegularizacionVerificadaUseCase } from "../functions/_shared/modules/fiscal/application/ReabrirRegularizacionVerificadaUseCase.ts";
import { ResolverAnulacionUseCase } from "../functions/_shared/modules/fiscal/application/ResolverAnulacionUseCase.ts";
import { ProcesarPendientesFiscalesUseCase } from "../functions/_shared/modules/fiscal/application/ProcesarPendientesFiscalesUseCase.ts";
import {
  actor,
  autorizacion,
  contexto,
  contextoNc,
  ejecucion,
  fake,
  id,
  inicio,
} from "./fixtures/fiscal-regularizacion-fixture.ts";
describe("calendario exacto sin ráfagas", () => {
  test("inicio ofrece +10 sin consumir presupuesto", () => {
    const c = calendarioRegularizacion(inicio, new Date(inicio), 0);
    expect(c.proximo).toBe("2026-10-25T03:10:00.000Z");
    expect(c.puedeForzar).toBe(true);
  });
  for (const minuto of MINUTOS_REGULARIZACION) {
    test("futuro estricto tras minuto " + minuto, () => {
      const c = calendarioRegularizacion(
        inicio,
        new Date(Date.parse(inicio) + minuto * 60000),
        1,
      );
      const next = MINUTOS_REGULARIZACION.find((v) => v > minuto);
      expect(c.proximo).toBe(
        next === undefined
          ? null
          : new Date(Date.parse(inicio) + next * 60000).toISOString(),
      );
    });
  }
  test("1381 minutos permite manual con próxima null", () => {
    const c = calendarioRegularizacion(
      inicio,
      new Date(Date.parse(inicio) + 1381 * 60000),
      5,
    );
    expect(c.proximo).toBeNull();
    expect(c.puedeForzar).toBe(true);
  });
  test("exactamente 24h y después no inician", () => {
    for (const dt of [86400000, 86400001]) {
      const c = calendarioRegularizacion(
        inicio,
        new Date(Date.parse(inicio) + dt),
        0,
      );
      expect(c.expirado).toBe(true);
      expect(c.puedeForzar).toBe(false);
    }
  });
  test("justo antes 24h permite último manual", () =>
    expect(
      calendarioRegularizacion(
        inicio,
        new Date(Date.parse(inicio) + 86399999),
        5,
      ).puedeForzar,
    ).toBe(true));
  test("seis iniciados agota presupuesto", () =>
    expect(calendarioRegularizacion(inicio, new Date(inicio), 6).expirado).toBe(
      true,
    ));
  test("fechas/contadores corruptos no producen horarios", () => {
    for (const n of [-1, 7, 1.5]) {
      expect(() => calendarioRegularizacion(inicio, new Date(inicio), n))
        .toThrow();
    }
    expect(() => calendarioRegularizacion("mal", new Date(), 0)).toThrow();
  });
});
describe("NC congela original", () => {
  test("serie propia y asociación oficial completa", () => {
    const s = construirSolicitudFiscal(
      contextoNc(),
      "1",
      new Date("2026-10-26T03:00:00Z"),
    );
    expect(s.identidad.tipoComprobante).toBe(13);
    expect(s.detalle.CbteDesde).toBe("1");
    expect(s.detalle.CbtesAsoc).toEqual([{
      Tipo: 11,
      PtoVta: 1,
      Nro: "15",
      Cuit: "30000000007",
      CbteFch: "20261025",
    }]);
    expect(s.detalle.ImpTotal).toBe("121.00");
    expect(s.detalle.ImpNeto).toBe("100.00");
  });
  test("editar datos actuales no altera emisor/receptor/importes originales", () => {
    const c = contextoNc();
    c.club.nombre = "Cambiado";
    c.socio.nombre = "Cambiado";
    c.receptor = null;
    c.configuracion!.perfil_importes = { modo: "exento" };
    const s = construirSolicitudFiscal(c, "1", new Date(inicio));
    expect(s.emisor.nombre).toBe("Club sintético");
    expect(s.receptor.nombre).toBe("SOCIO SIMULACION");
    expect(s.detalle.ImpIVA).toBe("21.00");
  });
  test("no infiere código NC de factura", () => {
    const c = contextoNc();
    c.configuracion!.tipo_nota_credito = null;
    expect(() => construirSolicitudFiscal(c, "1", new Date(inicio))).toThrow();
  });
  test("exige factura autorizada del mismo pago", () => {
    const c = contextoNc();
    c.origen!.cae = null;
    expect(() => construirSolicitudFiscal(c, "1", new Date(inicio))).toThrow();
    c.origen!.cae = "90000000000001";
    c.origen!.pago_id = actor;
    expect(() => construirSolicitudFiscal(c, "1", new Date(inicio))).toThrow();
  });
  test("no asocia número distinto del snapshot", () => {
    const c = contextoNc();
    c.origen!.numero_comprobante = "16";
    expect(() => construirSolicitudFiscal(c, "1", new Date(inicio))).toThrow();
  });
});
describe("reapertura/resolución sin segundo envío", () => {
  test("fallido sin intento reabre sin puerto", async () => {
    const f = fake();
    f.ctx.comprobante.estado_fiscal = "fallido";
    const out = await new ReabrirRegularizacionVerificadaUseCase(f.repo, () => {
      throw new Error("Nunca");
    }).ejecutar(id, actor);
    expect(out.resultado).toBe("reabierto");
    expect(f.calls).toEqual(["reabrir"]);
  });
  test("pendiente no se reabre", async () => {
    const f = fake();
    expect(
      (await new ReabrirRegularizacionVerificadaUseCase(f.repo, () => f.arca)
        .ejecutar(id, actor)).resultado,
    ).toBe("bloqueado");
    expect(f.calls).toEqual([]);
  });
  test("factura de pago anulado no se reabre", async () => {
    const f = fake();
    f.ctx.pago.estado = "anulado";
    f.ctx.comprobante.estado_fiscal = "fallido";
    expect(
      (await new ReabrirRegularizacionVerificadaUseCase(f.repo, () => f.arca)
        .ejecutar(id, actor)).resultado,
    ).toBe("bloqueado");
  });
  test("ausencia de desconocido conserva reserva", async () => {
    const c = contexto();
    c.comprobante.estado_fiscal = "fallido";
    c.ejecucion = ejecucion(c);
    const f = fake(c);
    expect(
      (await new ReabrirRegularizacionVerificadaUseCase(f.repo, () => f.arca)
        .ejecutar(id, actor)).resultado,
    ).toBe("sin_cambios");
    expect(f.calls).toEqual([]);
  });
  test("consulta incompatible conserva previo", async () => {
    const c = contexto();
    c.comprobante.estado_fiscal = "fallido";
    c.ejecucion = ejecucion(c);
    const f = fake(c), a = autorizacion(c.ejecucion);
    a.importeTotal = "122.00";
    f.arca.consultar = async () => ({
      tipo: "encontrado",
      autorizacion: a,
      observaciones: [],
    });
    expect(
      (await new ReabrirRegularizacionVerificadaUseCase(f.repo, () => f.arca)
        .ejecutar(id, actor)).resultado,
    ).toBe("sin_cambios");
    expect(f.calls).toEqual([]);
  });
  test("match exacto confirma sin reiniciar ventana", async () => {
    const c = contexto();
    c.comprobante.estado_fiscal = "fallido";
    c.ejecucion = ejecucion(c);
    const f = fake(c);
    f.arca.consultar = async () => ({
      tipo: "encontrado",
      autorizacion: autorizacion(c.ejecucion!),
      observaciones: [],
    });
    expect(
      (await new ReabrirRegularizacionVerificadaUseCase(f.repo, () => f.arca)
        .ejecutar(id, actor)).resultado,
    ).toBe("autorizado");
    expect(f.calls).toEqual(["iniciar:conciliacion", "confirmar:autorizado"]);
  });
  test("rechazo R más ausencia permite reapertura", async () => {
    const c = contexto();
    c.comprobante.estado_fiscal = "fallido";
    c.ejecucion = ejecucion(c, "rechazado");
    const f = fake(c);
    expect(
      (await new ReabrirRegularizacionVerificadaUseCase(f.repo, () => f.arca)
        .ejecutar(id, actor)).resultado,
    ).toBe("reabierto");
    expect(f.calls).toEqual(["reabrir"]);
  });
  test("registro externo sin identidad no acepta CAE libre", async () => {
    const f = fake();
    f.ctx.comprobante.estado_fiscal = "fallido";
    expect(
      (await new ReabrirRegularizacionVerificadaUseCase(f.repo, () => f.arca)
        .ejecutar(id, actor, true)).resultado,
    ).toBe("sin_cambios");
    expect(f.calls).toEqual([]);
  });
  test("anulación desconocida sólo consulta", async () => {
    const c = contexto();
    c.ejecucion = ejecucion(c);
    c.pago.estado = "anulado";
    c.comprobante.estado_fiscal = "anulacion_pendiente";
    const f = fake(c);
    const out = await new ResolverAnulacionUseCase(f.repo, f.arca).ejecutar(
      id,
      actor,
    );
    expect(out.resultado).toBe("pendiente");
    expect(f.calls).toEqual([
      "resolver_sin_envio",
      "iniciar:conciliacion",
      "resolver:desconocido",
    ]);
  });
  test("NC creada vuelve a mismo resultado", async () => {
    const f = fake();
    f.ctx.pago.estado = "anulado";
    f.ctx.comprobante.estado_fiscal = "anulacion_pendiente";
    f.ctx.comprobante.cae = "90000000000001";
    f.ctx.notaCreditoId = actor;
    expect(
      (await new ResolverAnulacionUseCase(f.repo, f.arca).ejecutar(id, actor))
        .resultado,
    ).toBe("resuelto");
    expect(f.calls).toEqual([]);
  });
  test("regularizar delega al motor con modo manual", async () => {
    const f = fake();
    expect(
      (await new RegularizarComprobanteUseCase(f.repo, f.arca).ejecutar(
        id,
        "manual",
      )).resultado,
    ).toBe("bloqueado");
    expect(f.calls).toEqual(["expirar", "iniciar:manual"]);
  });
});
describe("reapertura de ejecución sin posible envío", () => {
  test("consulta ausente cierra con fencing una ejecución que no marcó envío", async () => {
    const c = contexto();
    c.comprobante.estado_fiscal = "fallido";
    c.ejecucion = ejecucion(c, "incidencia");
    c.ejecucion.posibleEnvio = false;
    const f = fake(c);
    expect(
      (await new ReabrirRegularizacionVerificadaUseCase(f.repo, () => f.arca)
        .ejecutar(id, actor)).resultado,
    ).toBe("reabierto");
    expect(f.calls).toEqual(["reabrir_sin_envio"]);
  });
  test("consulta con documento de otro origen no libera ejecución sin envío", async () => {
    const c = contexto();
    c.comprobante.estado_fiscal = "fallido";
    c.ejecucion = ejecucion(c, "incidencia");
    c.ejecucion.posibleEnvio = false;
    const f = fake(c);
    f.arca.consultar = async () => ({
      tipo: "encontrado",
      autorizacion: autorizacion(c.ejecucion!),
      observaciones: [],
    });
    expect(
      (await new ReabrirRegularizacionVerificadaUseCase(f.repo, () => f.arca)
        .ejecutar(id, actor)).resultado,
    ).toBe("sin_cambios");
    expect(f.calls).toEqual([]);
  });
});
describe("fuentes antes de toda ejecución nueva", () => {
  test("reintento nuevo sin perfil confirmado no adquiere ni hace red", async () => {
    const c = contexto();
    c.ejecucion = ejecucion(c, "transitorio");
    c.configuracion!.confirmado = false;
    const f = fake(c);
    await expect(
      new RegularizarComprobanteUseCase(f.repo, f.arca).ejecutar(id, "manual"),
    ).rejects.toThrow();
    expect(f.calls).toEqual(["expirar"]);
  });
  test("no acepta NC con mismo código fiscal de factura", () => {
    const c = contextoNc();
    c.configuracion!.tipo_nota_credito = c.configuracion!.tipo_factura;
    expect(() => construirSolicitudFiscal(c, "1", new Date(inicio))).toThrow();
  });
});
describe("lote acotado y parcial", () => {
  test("vacío 200 con identidad", async () => {
    const f = fake();
    const result = await new ProcesarPendientesFiscalesUseCase(
      f.repo,
      async () => {
        throw new Error("Nunca");
      },
      () => id,
    ).ejecutar();
    expect(result.http).toBe(200);
    expect(result.body.evaluados).toBe(0);
    expect(result.body.ejecucionId).toBe(id);
  });
  test("fallo global 503", async () => {
    const f = fake();
    f.repo.listarCandidatos = async () => {
      throw new Error("DB");
    };
    const result = await new ProcesarPendientesFiscalesUseCase(
      f.repo,
      async () => {
        throw new Error("Nunca");
      },
    ).ejecutar();
    expect(result.http).toBe(503);
    expect(result.body.evaluados).toBe(0);
  });
  test("fallo por fila no oculta siguiente", async () => {
    const f = fake();
    f.repo.listarCandidatos = async () => ({
      candidatos: [{
        comprobanteId: id,
        recuperable: false,
        fechaElegible: inicio,
      }, { comprobanteId: actor, recuperable: false, fechaElegible: inicio }],
      hayMas: false,
    });
    const result = await new ProcesarPendientesFiscalesUseCase(
      f.repo,
      async (cid) => {
        if (cid === id) throw new Error("Desconocido");
        return { resultado: "pendiente", advertencia: null, ejecucion: null };
      },
    ).ejecutar();
    expect(result.http).toBe(200);
    expect(result.body.evaluados).toBe(2);
    expect(result.body.errores).toEqual([{
      comprobanteId: id,
      codigo: "OPERACION_NO_CONFIRMADA",
    }]);
    expect(result.body.pendientes).toBe(2);
  });
  test("vencido con próxima NULL no emite", async () => {
    const f = fake();
    f.repo.listarCandidatos = async () => ({
      candidatos: [{
        comprobanteId: id,
        recuperable: false,
        fechaElegible: inicio,
      }],
      hayMas: false,
    });
    f.repo.expirar = async () => ({ expirado: true });
    let sent = false;
    const result = await new ProcesarPendientesFiscalesUseCase(
      f.repo,
      async () => {
        sent = true;
        throw new Error("Nunca");
      },
    ).ejecutar();
    expect(result.body.expirados).toBe(1);
    expect(sent).toBe(false);
  });
  test("presupuesto evita nueva adquisición tardía", async () => {
    const f = fake();
    f.repo.listarCandidatos = async () => ({
      candidatos: [{
        comprobanteId: id,
        recuperable: false,
        fechaElegible: inicio,
      }],
      hayMas: false,
    });
    let clock = 0;
    const result = await new ProcesarPendientesFiscalesUseCase(
      f.repo,
      async () => {
        throw new Error("Nunca");
      },
      () => id,
      () => clock++ ? 25000 : 0,
    ).ejecutar();
    expect(result.body.hayMas).toBe(true);
    expect(result.body.evaluados).toBe(0);
  });
});

describe("resolución de anulación con rechazo terminal", () => {
  function rechazado() {
    const c = contexto();
    c.ejecucion = ejecucion(c, "rechazado");
    c.ejecucion.cerradoEn = inicio;
    c.pago.estado = "anulado";
    c.comprobante.estado_fiscal = "anulacion_pendiente";
    return fake(c);
  }
  test("R más ausencia cierra documento sin adquirir ni repetir envío", async () => {
    const f = rechazado();
    const out = await new ResolverAnulacionUseCase(f.repo, f.arca).ejecutar(
      id,
      actor,
    );
    expect(out.resultado).toBe("resuelto");
    expect(f.calls).toEqual(["resolver_sin_envio", "resolver_rechazo_anulado"]);
  });
  test("R más coincidencia exacta registra autorización y no retorna R antiguo", async () => {
    const f = rechazado();
    f.arca.consultar = async () => ({
      tipo: "encontrado",
      autorizacion: autorizacion(f.ctx.ejecucion!),
      observaciones: [],
    });
    const out = await new ResolverAnulacionUseCase(f.repo, f.arca).ejecutar(
      id,
      actor,
    );
    expect(out.resultado).toBe("autorizado");
    expect(f.calls).toEqual(["resolver_sin_envio", "registrar"]);
  });
  test("R más otro documento conserva historia y reserva ajena", async () => {
    const f = rechazado(), a = autorizacion(f.ctx.ejecucion!);
    a.importeTotal = "999.00";
    f.arca.consultar = async () => ({
      tipo: "encontrado",
      autorizacion: a,
      observaciones: [],
    });
    expect(
      (await new ResolverAnulacionUseCase(f.repo, f.arca).ejecutar(id, actor))
        .resultado,
    ).toBe("sin_cambios");
    expect(f.calls).toEqual(["resolver_sin_envio"]);
  });
  test("R más error de consulta conserva anulación pendiente", async () => {
    const f = rechazado();
    f.arca.consultar = async () => {
      throw new Error("Sin red");
    };
    expect(
      (await new ResolverAnulacionUseCase(f.repo, f.arca).ejecutar(id, actor))
        .resultado,
    ).toBe("sin_cambios");
    expect(f.calls).toEqual(["resolver_sin_envio"]);
  });
});

describe("cierre local de anulación sin envío demostrado", () => {
  test("historia segura cierra aunque último intento carezca de identidad y no crea puerto", async () => {
    const c = contexto();
    c.ejecucion = ejecucion(c, "transitorio");
    c.ejecucion.numero = null;
    c.ejecucion.solicitud = null;
    c.ejecucion.posibleEnvio = false;
    c.pago.estado = "anulado";
    c.comprobante.estado_fiscal = "anulacion_pendiente";
    const f = fake(c);
    f.repo.resolverSinEnvio = async () => {
      f.calls.push("resolver_sin_envio");
      return { resuelto: true };
    };
    const out = await new ResolverAnulacionUseCase(f.repo, () => {
      throw new Error("No debe leer configuración ni llamar ARCA");
    }).ejecutar(id, actor);
    expect(out.resultado).toBe("resuelto");
    expect(f.calls).toEqual(["resolver_sin_envio"]);
  });
  test("sin prueba local e identidad preservada exige puerto habilitado antes de adquirir", async () => {
    const c = contexto();
    c.ejecucion = ejecucion(c);
    c.pago.estado = "anulado";
    c.comprobante.estado_fiscal = "anulacion_pendiente";
    const f = fake(c);
    await expect(new ResolverAnulacionUseCase(f.repo, () => {
      throw new Error("Homologación pendiente");
    }).ejecutar(id, actor)).rejects.toThrow("Homologación pendiente");
    expect(f.calls).toEqual(["resolver_sin_envio"]);
  });
  test("sin prueba local ni identidad no atribuye ausencia ni crea puerto", async () => {
    const c = contexto();
    c.ejecucion = ejecucion(c, "transitorio");
    c.ejecucion.numero = null;
    c.ejecucion.solicitud = null;
    c.ejecucion.posibleEnvio = false;
    c.pago.estado = "anulado";
    c.comprobante.estado_fiscal = "anulacion_pendiente";
    const f = fake(c);
    const out = await new ResolverAnulacionUseCase(f.repo, () => {
      throw new Error("No crear puerto sin identidad");
    }).ejecutar(id, actor);
    expect(out.resultado).toBe("bloqueado");
    expect(f.calls).toEqual(["resolver_sin_envio"]);
  });
});
