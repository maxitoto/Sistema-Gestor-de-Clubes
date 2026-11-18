import { describe, expect, test } from 'bun:test';
import { parseEstadoFiscal } from '../src/entities/comprobante/model/fiscalContract';
import {
	type FilaMonitoreo,
	parseFilaMonitoreo,
	parseResultadoAccionFiscal,
	parseResultadoMonitoreo,
	puedeAccionFiscal,
} from '../src/entities/monitoreo-fiscal/model/monitoreoContract';
import {
	estadoFiscalCobranza,
	estadoFiscalDocumento,
	type FilaCobranza,
} from '../src/shared/types/cobranza';

const id = '00000000-0000-0000-0000-000000000001',
	other = '00000000-0000-0000-0000-000000000002';
function row(): FilaMonitoreo {
	return {
		comprobanteId: id,
		pagoId: other,
		socio: {
			id: other,
			nombre: 'Persona sintética',
			apellido: 'Prueba',
			dni: '30000001',
			nroSocio: 1,
		},
		tipo: 'factura',
		estadoFiscal: 'pendiente_cae',
		fechaCobro: '2026-10-25T03:00:00Z',
		monto: '1234.56',
		intentos: 1,
		ventanaInicio: '2026-10-25T03:00:00Z',
		ventanaFin: '2026-10-26T03:00:00Z',
		proximoReintento: null,
		numero: null,
		cae: null,
		vencimiento: null,
		detalleError: null,
		origenId: null,
		ncId: null,
		pagoEstado: 'completado',
		operacion: null,
		acciones: { forzar: true, reabrir: true, resolver: true, registrarExterno: true },
		bloqueo: null,
	};
}
const criteria = { page: 1, pageSize: 20 as const };
const result = () => ({
	items: [row()],
	page: 1,
	pageSize: 20,
	total: 1,
	conteos: { pendientes: 1, fallidos: 0, anulacionPendiente: 0 },
	externoHabilitado: false,
});
const fiscal = () => ({
	comprobanteId: id,
	pagoId: other,
	cobroConfirmado: false,
	estadoFiscal: 'anulado',
	numero: '17',
	cae: '90000000000001',
	vencimiento: '2026-11-04',
	operacion: 'autorizado',
	emisionDisponible: false,
	aviso: null,
	pdfVersion: 'autorizado',
});
describe('frontera de monitoreo y relaciones fiscales', () => {
	test('página tipada conserva total global sin filtrar filas en cliente', () => {
		const payload = { ...result(), total: 81 };
		expect(parseResultadoMonitoreo(payload, criteria).total).toBe(81);
		expect(parseResultadoMonitoreo(payload, criteria).items.length).toBe(1);
	});
	test('página o tamaño cruzados no se aceptan', () => {
		for (const change of [
			{ page: 2 },
			{ pageSize: 50 },
			{ total: -1 },
			{ externoHabilitado: 'true' },
		]) {
			expect(() => parseResultadoMonitoreo({ ...result(), ...change }, criteria)).toThrow();
		}
	});
	test('duplicado de identidad o filas mayores al conteo no se aceptan', () => {
		expect(() =>
			parseResultadoMonitoreo({ ...result(), items: [row(), row()], total: 2 }, criteria),
		).toThrow();
		expect(() => parseResultadoMonitoreo({ ...result(), total: 0 }, criteria)).toThrow();
	});
	test('importe exacto y contador real se conservan, incluyendo contador cero', () => {
		expect(parseFilaMonitoreo({ ...row(), intentos: 0 }).intentos).toBe(0);
		expect(parseFilaMonitoreo(row()).monto).toBe('1234.56');
		for (const change of [
			{ monto: 1 },
			{ monto: '1e6' },
			{ monto: '-1.00' },
			{ monto: '1.001' },
			{ intentos: 7 },
			{ intentos: -1 },
		]) {
			expect(() => parseFilaMonitoreo({ ...row(), ...change })).toThrow();
		}
	});
	test('ventana y siguiente fecha nulas no se interpretan como contador agotado', () => {
		const value = parseFilaMonitoreo({
			...row(),
			ventanaInicio: null,
			ventanaFin: null,
			intentos: 2,
			proximoReintento: null,
		});
		expect(value.intentos).toBe(2);
		expect(value.proximoReintento).toBeNull();
	});
	test('ventana incoherente y relaciones inválidas fallan cerradas', () => {
		for (const change of [
			{ ventanaFin: '2026-10-24T03:00:00Z' },
			{ origenId: 'ilegible' },
			{ fechaCobro: 'sin fecha' },
			{ pagoEstado: 'pagado' },
			{ estadoFiscal: 'valido' },
		]) {
			expect(() => parseFilaMonitoreo({ ...row(), ...change })).toThrow();
		}
	});
	test('ambos roles consultan pero Responsable no habilita acciones aunque payload las marque', () => {
		for (const accion of ['forzar', 'reabrir', 'resolver', 'registrar-externo'] as const) {
			expect(puedeAccionFiscal(row(), accion, false, true)).toBe(false);
		}
	});
	test('gate cerrado impide red pero no inventa rechazo de reapertura local elegible', () => {
		for (const accion of ['forzar', 'registrar-externo'] as const) {
			expect(puedeAccionFiscal(row(), accion, true, false)).toBe(false);
		}
		expect(puedeAccionFiscal(row(), 'reabrir', true, false)).toBe(true);
		expect(
			puedeAccionFiscal(
				{ ...row(), acciones: { ...row().acciones, reabrir: false } },
				'reabrir',
				true,
				true,
			),
		).toBe(false);
	});
	test('resolución local de anulación requiere Admin, estado y permiso sin habilitar ARCA', () => {
		const pending = {
			...row(),
			estadoFiscal: 'anulacion_pendiente' as const,
			pagoEstado: 'anulado' as const,
		};
		expect(puedeAccionFiscal(pending, 'resolver', true, false)).toBe(true);
		expect(puedeAccionFiscal(pending, 'resolver', false, false)).toBe(false);
		expect(
			puedeAccionFiscal(
				{ ...pending, acciones: { ...pending.acciones, resolver: false } },
				'resolver',
				true,
				false,
			),
		).toBe(false);
		expect(puedeAccionFiscal(row(), 'resolver', true, false)).toBe(false);
	});
	test('acción externa sólo se ofrece si servidor declara permiso explícito', () => {
		const source = row() as unknown as Record<string, unknown>;
		source.acciones = { forzar: true, reabrir: true, resolver: true };
		expect(parseFilaMonitoreo(source).acciones.registrarExterno).toBe(false);
	});
	test('resumen y booleanos coercibles no se convierten silenciosamente', () => {
		expect(() =>
			parseResultadoMonitoreo(
				{ ...result(), conteos: { pendientes: '1', fallidos: 0, anulacionPendiente: 0 } },
				criteria,
			),
		).toThrow();
		expect(() =>
			parseFilaMonitoreo({ ...row(), acciones: { forzar: 1, reabrir: true, resolver: true } }),
		).toThrow();
	});
	test('resultado de acción cerrado no anuncia autorización con estado desconocido', () => {
		expect(
			parseResultadoAccionFiscal({ resultado: 'pendiente', advertencia: null }).resultado,
		).toBe('pendiente');
		expect(
			parseResultadoAccionFiscal({ resultado: 'sin_cambios', advertencia: 'No se modificó.' })
				.advertencia,
		).toBe('No se modificó.');
		for (const value of [
			{ resultado: 'ok', advertencia: null },
			{ resultado: 'autorizado' },
			null,
		]) {
			expect(() => parseResultadoAccionFiscal(value)).toThrow();
		}
	});
	test('Nota de Crédito anulada conserva su CAE y vínculo propio', () => {
		const value = {
			...fiscal(),
			tipoDocumento: 'nota_credito',
			comprobanteOrigenId: other,
			notaCreditoId: null,
		};
		expect(parseEstadoFiscal(value, id).tipoDocumento).toBe('nota_credito');
		expect(parseEstadoFiscal(value, id).cobroConfirmado).toBe(false);
		expect(parseEstadoFiscal(value, id).comprobanteOrigenId).toBe(other);
	});
	test('factura permite relación NC sin atribuirle un número ajeno', () => {
		expect(
			parseEstadoFiscal(
				{ ...fiscal(), tipoDocumento: 'factura', comprobanteOrigenId: null, notaCreditoId: other },
				id,
			).notaCreditoId,
		).toBe(other);
		expect(
			parseEstadoFiscal(
				{
					...fiscal(),
					estadoFiscal: 'anulacion_pendiente',
					tipoDocumento: 'factura',
					comprobanteOrigenId: null,
					notaCreditoId: other,
				},
				id,
			).numero,
		).toBe('17');
	});
	test('relaciones incompletas o autoreferentes son rechazadas', () => {
		for (const change of [
			{ tipoDocumento: 'nota_credito', comprobanteOrigenId: null, notaCreditoId: null },
			{ tipoDocumento: 'factura', comprobanteOrigenId: other, notaCreditoId: null },
			{ tipoDocumento: 'nota_credito', comprobanteOrigenId: id, notaCreditoId: null },
			{ tipoDocumento: 'factura', comprobanteOrigenId: null, notaCreditoId: id },
			{ tipoDocumento: 'factura' },
		]) {
			expect(() => parseEstadoFiscal({ ...fiscal(), ...change }, id)).toThrow();
		}
	});
	test('PDF autorizado anulado requiere CAE número y vencimiento completos', () => {
		for (const change of [{ numero: null }, { cae: null }, { vencimiento: '2026-02-30' }]) {
			expect(() => parseEstadoFiscal({ ...fiscal(), ...change }, id)).toThrow();
		}
	});
});

test('anulación financiera pendiente de NC mantiene estados distintos en el detalle', () => {
	const row = { estado_pago: 'anulado', estado_fiscal: 'anulacion_pendiente' } as FilaCobranza;
	expect(estadoFiscalCobranza(row)).toBe('Cobro anulado');
	expect(estadoFiscalDocumento(row.estado_fiscal)).toBe('Anulación fiscal pendiente');
	expect(estadoFiscalDocumento('anulado')).toBe('Documento anulado');
});
