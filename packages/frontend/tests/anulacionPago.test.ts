import { describe, expect, test } from 'bun:test';
import {
	type EstadoAnulacionPago,
	motivoBloqueoAnulacionPago,
	parseEstadoAnulacionPago,
	parseResultadoAnulacionPago,
	validarMotivoAnulacionPago,
} from '../src/entities/pago/model/anulacionPago';

const id = '00000000-0000-0000-0000-000000000001',
	actor = '00000000-0000-0000-0000-000000000002';
const pago = () => ({
	id,
	estado: 'completado',
	fecha_pago: '2026-10-25T03:00:00Z',
	motivo_anulacion: null,
	anulado_por: null,
	anulado_at: null,
});
const factura = () => ({ estado_fiscal: 'fallido', cae: null });
const row = (): EstadoAnulacionPago =>
	parseEstadoAnulacionPago(pago(), factura(), '2026-10-25', id);
describe('contrato y permiso informativo de anulación de cobro', () => {
	test('Responsable habilitado hoy según fecha de servidor, sin reloj del navegador', () => {
		expect(motivoBloqueoAnulacionPago(row(), 'responsable')).toBeNull();
		expect(
			motivoBloqueoAnulacionPago({ ...row(), fechaClub: '2026-10-26' }, 'responsable'),
		).toContain('días anteriores');
	});
	test('frontera de medianoche Buenos Aires no usa el día UTC', () => {
		expect(
			motivoBloqueoAnulacionPago(
				{ ...row(), fechaPago: '2026-10-25T02:59:59.999Z' },
				'responsable',
			),
		).not.toBeNull();
		expect(
			motivoBloqueoAnulacionPago(
				{ ...row(), fechaPago: '2026-10-25T03:00:00.000Z' },
				'responsable',
			),
		).toBeNull();
	});
	test('Administrador puede consultar acción histórica pero no un rol inventado', () => {
		expect(
			motivoBloqueoAnulacionPago({ ...row(), fechaPago: '2025-01-01T10:00:00Z' }, 'admin'),
		).toBeNull();
		expect(motivoBloqueoAnulacionPago(row(), 'cajero')).not.toBeNull();
	});
	test('pendiente de CAE nunca se vuelve anulable por interfaz', () => {
		for (const estadoFiscal of ['pendiente_cae', 'anulado', 'anulacion_pendiente'] as const) {
			expect(motivoBloqueoAnulacionPago({ ...row(), estadoFiscal }, 'admin')).not.toBeNull();
		}
	});
	test('válido exige CAE y doble anulación no se habilita', () => {
		expect(
			motivoBloqueoAnulacionPago({ ...row(), estadoFiscal: 'valido', cae: null }, 'admin'),
		).not.toBeNull();
		expect(
			motivoBloqueoAnulacionPago(
				{ ...row(), estadoFiscal: 'valido', cae: '90000000000001' },
				'admin',
			),
		).toBeNull();
		expect(motivoBloqueoAnulacionPago({ ...row(), estado: 'anulado' }, 'admin')).not.toBeNull();
	});
	test('motivo obligatorio limpio y acotado', () => {
		expect(validarMotivoAnulacionPago(' devolución controlada ')).toBe('devolución controlada');
		for (const value of ['', ' \n ', 'x'.repeat(2001)]) {
			expect(() => validarMotivoAnulacionPago(value)).toThrow();
		}
	});
	test('respuesta NULL no es fallo y UUID indica NC sin prometer autorización', () => {
		expect(parseResultadoAnulacionPago(null)).toBeNull();
		expect(parseResultadoAnulacionPago(actor)).toBe(actor);
		for (const value of ['', {}, true, 1]) {
			expect(() => parseResultadoAnulacionPago(value)).toThrow();
		}
	});
	test('respuesta ilegible obliga a recuperar por consulta', () => {
		try {
			parseResultadoAnulacionPago({ nc: id });
			throw new Error('debe rechazar');
		} catch (error) {
			expect((error as { responseReceived?: boolean }).responseReceived).toBe(true);
		}
	});
	test('lectura recuperada ata identidad y conserva autor motivo y fecha del servidor', () => {
		const result = parseEstadoAnulacionPago(
			{
				...pago(),
				estado: 'anulado',
				motivo_anulacion: 'Corrección',
				anulado_por: actor,
				anulado_at: '2026-10-25T04:00:00Z',
			},
			factura(),
			'2026-10-25',
			id,
		);
		expect(result.estado).toBe('anulado');
		expect(result.anuladoPor).toBe(actor);
		expect(result.motivo).toBe('Corrección');
		expect(() =>
			parseEstadoAnulacionPago({ ...pago(), id: actor }, factura(), '2026-10-25', id),
		).toThrow();
	});
	test('anulación sin metadata no se anuncia confirmada', () => {
		for (const change of [
			{ anulado_por: null },
			{ anulado_at: null },
			{ motivo_anulacion: '  ' },
		]) {
			expect(() =>
				parseEstadoAnulacionPago(
					{
						...pago(),
						estado: 'anulado',
						motivo_anulacion: 'Corrección',
						anulado_por: actor,
						anulado_at: '2026-10-25T04:00:00Z',
						...change,
					},
					factura(),
					'2026-10-25',
					id,
				),
			).toThrow();
		}
	});
	test('fecha o estado desconocido exige consultar nuevamente', () => {
		expect(() => parseEstadoAnulacionPago(pago(), factura(), '2026-02-30', id)).toThrow();
		expect(() =>
			parseEstadoAnulacionPago({ ...pago(), fecha_pago: 'ilegible' }, factura(), '2026-10-25', id),
		).toThrow();
		expect(() =>
			parseEstadoAnulacionPago(pago(), { estado_fiscal: 'aprobado', cae: null }, '2026-10-25', id),
		).toThrow();
	});
});
