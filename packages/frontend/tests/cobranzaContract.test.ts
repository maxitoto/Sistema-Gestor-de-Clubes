import { describe, expect, spyOn, test } from 'bun:test';
import { parseComprobanteCobrado } from '../src/entities/pago/model/cobroUuid';
import {
	cobroVerificado,
	parseIntentoCobro,
	validarSolicitudCobro,
} from '../src/features/cobrar-cuota/model/cobroContract';
import {
	type FilaCobranza,
	fechaCobranza,
	monedaCobranza,
	parseResultadoCobranza,
} from '../src/shared/types/cobranza';

const a = 'd8de8561-22a0-42ab-a03b-ab7a9a3f1027',
	b = '32f304b4-60d9-4c63-8c16-18c03f2f7029',
	c = '2fb345dd-072f-4fed-98f0-83a4582f3608';
const row: FilaCobranza = {
	id: a,
	cuota_id: a,
	pago_id: b,
	comprobante_id: c,
	socio_id: a,
	socio_numero: 60,
	socio_dni: '001234',
	socio_nombre: 'Prueba',
	socio_apellido: 'Local',
	socio_estado: 'inactivo',
	categoria_id: b,
	categoria_nombre: 'Categoría',
	deporte_id: c,
	deporte_nombre: 'Deporte',
	periodo_mes: 10,
	periodo_anio: 2026,
	monto: 2500,
	estado_cuota: 'pagada',
	estado_pago: 'completado',
	estado_fiscal: 'pendiente_cae',
	etiqueta_recibo: 'pendiente_cae',
	numero_comprobante: null,
	fecha: '2026-10-24T12:00:00Z',
	fecha_pago: '2026-10-24T12:00:00Z',
	medio: 'efectivo',
	referencia: null,
	usuario_id: b,
	es_moroso: false,
	deuda_pendiente: 1000,
	cuota_en_mora: false,
};
describe('cobranza: dinero y fiscalidad separados', () => {
	test('UUID precargados válidos para PostgreSQL se consultan sin exigir variante RFC', () => {
		const legacy = {
			...row,
			id: 'b9999999-9999-9999-9999-999999999999',
			cuota_id: 'e4444444-4444-4444-4444-444444444444',
			socio_id: 'a4444444-4444-4444-4444-444444444444',
			categoria_id: 'c2222222-2222-2222-2222-222222222222',
			deporte_id: 'd2222222-2222-2222-2222-222222222222',
		};
		expect(
			parseResultadoCobranza({ filas: [legacy], total: 1, deuda_filtrada: '0' }).filas[0]?.id,
		).toBe(legacy.id);
	});

	test('respuesta de RPC es UUID de comprobante y no un objeto ni alias', () => {
		expect(parseComprobanteCobrado(c)).toBe(c);
		for (const value of [null, { comprobante_id: c }, [c], 'pago-local']) {
			expect(() => parseComprobanteCobrado(value)).toThrow();
		}
	});
	test('pendiente fiscal sigue siendo cobro confirmado aun si el socio está inactivo', () => {
		expect(cobroVerificado(row, a, c)).toBe(true);
		expect(cobroVerificado({ ...row, estado_fiscal: 'fallido' }, a, c)).toBe(true);
		expect(cobroVerificado({ ...row, estado_pago: 'anulado' }, a, c)).toBe(false);
		expect(cobroVerificado({ ...row, estado_cuota: 'pendiente' }, a, c)).toBe(false);
	});
	test('recuperación comprueba cuota, pago y documento exactos', () => {
		expect(cobroVerificado(row, b, c)).toBe(false);
		expect(cobroVerificado(row, a, b)).toBe(false);
		expect(cobroVerificado(null, a, c)).toBe(false);
		expect(cobroVerificado({ ...row, pago_id: null }, a, c)).toBe(false);
	});
	test('transferencia exige verificación, pero no inventa referencia obligatoria', () => {
		expect(() => validarSolicitudCobro(a, 'transferencia', '', false)).toThrow('Verificá');
		expect(validarSolicitudCobro(a, 'transferencia', ' ', true)).toEqual({
			cuotaId: a,
			metodo: 'transferencia',
			referencia: null,
		});
		expect(validarSolicitudCobro(a, 'transferencia', ' banco ', true).referencia).toBe('banco');
		expect(validarSolicitudCobro(a, 'efectivo', 'texto', false).referencia).toBeNull();
	});
	test('el ticket no se recupera para otra identidad/cuota y conserva UUID confirmado', () => {
		const value = {
			usuarioId: b,
			cuotaId: a,
			solicitud: { cuotaId: a, metodo: 'efectivo', referencia: null },
			iniciadoEn: '2026-10-24T00:00:00Z',
			comprobanteId: c,
		};
		expect(parseIntentoCobro(value, b, a)?.comprobanteId).toBe(c);
		expect(parseIntentoCobro(value, c, a)).toBeNull();
		expect(parseIntentoCobro(value, b, c)).toBeNull();
		expect(parseIntentoCobro({ ...value, comprobanteId: 'otro' }, b, a)).toBeNull();
	});
	test('deuda agregada se interpreta aparte del número de filas y sin KPI financiero', () => {
		const parsed = parseResultadoCobranza({
			filas: [row],
			total: 125,
			deuda_filtrada: '9999999999999999.99',
		});
		expect(parsed.total).toBe(125);
		expect(parsed.filas.length).toBe(1);
		expect(parsed.deuda_filtrada).toBe('9999999999999999.99');
		expect(monedaCobranza(parsed.deuda_filtrada)).toContain('9.999.999.999.999.999,99');
	});
	test('respuesta sin conteo, con total contradictorio o clave financiera extra falla', () => {
		for (const value of [
			{ filas: [row], deuda_filtrada: '0' },
			{ filas: [row], total: 0, deuda_filtrada: '0' },
			{ filas: [], total: 0, deuda_filtrada: '0', monto_total: '999' },
			{ filas: [], total: 0, deuda_filtrada: -1 },
		]) {
			expect(() => parseResultadoCobranza(value)).toThrow();
		}
	});
});

describe('fecha de cobranza compartida por grilla y exportación', () => {
	test('mantiene el día de Buenos Aires alrededor de medianoche', () => {
		expect(fechaCobranza('2026-10-27T02:59:00Z')).toMatch(/^26\/10\/26, /u);
		expect(fechaCobranza('2026-10-27T03:00:00Z')).toMatch(/^27\/10\/26, /u);
	});
	test('conserva ausencia y error de fecha inválida', () => {
		expect(fechaCobranza(null)).toBe('Sin fecha registrada');
		expect(fechaCobranza('')).toBe('Sin fecha registrada');
		expect(() => fechaCobranza('fecha-invalida')).toThrow(RangeError);
	});
	test('1001 filas reutilizan Intl con el mismo resultado de formato', () => {
		const fecha = '2040-05-15T15:25:00Z';
		const esperado = new Intl.DateTimeFormat('es-AR', {
			timeZone: 'America/Argentina/Buenos_Aires',
			dateStyle: 'short',
			timeStyle: 'short',
		}).format(new Date(fecha));
		const construir = spyOn(Intl, 'DateTimeFormat');
		try {
			const resultados = Array.from({ length: 1001 }, () => fechaCobranza(fecha));
			expect(resultados).toHaveLength(1001);
			expect(new Set(resultados)).toEqual(new Set([esperado]));
			expect(construir).not.toHaveBeenCalled();
		} finally {
			construir.mockRestore();
		}
	});
});
