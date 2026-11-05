import { describe, expect, test } from 'bun:test';
import {
	parseJobCuotas,
	parseResultadoGeneracion,
	periodoCuotasDeFecha,
	verificarResultadoGeneracion,
} from '../src/entities/job-cuotas/model/jobCuotasContract';
import { parseIntentoGeneracion } from '../src/features/generar-cuotas/model/intentoGeneracion';

const id = '9b77f519-c144-4e0e-9ea8-6642455e28f2';
const response = {
	resultado: 'generado',
	job_id: id,
	periodo_mes: 10,
	periodo_anio: 2026,
	cuotas_generadas: 4,
	cuotas_omitidas: 2,
};
const job = {
	id,
	periodo_mes: 10,
	periodo_anio: 2026,
	estado: 'exitoso',
	cuotas_generadas: 4,
	cuotas_omitidas: 2,
	fecha_inicio: '2026-10-23T23:00:00Z',
	fecha_fin: '2026-10-23T23:00:01Z',
};

describe('generación mensual: contrato real y recuperación', () => {
	test('interpreta las seis claves reales y conserva identidad/contadores', () => {
		expect(parseResultadoGeneracion(response)).toEqual(response);
		expect(parseResultadoGeneracion({ ...response, resultado: 'ya_ejecutado' }).job_id).toBe(id);
	});
	test('HTTP200 con resultado fallido sigue siendo fallo, no éxito', () => {
		const failed = {
			...response,
			resultado: 'fallido',
			cuotas_generadas: 0,
			cuotas_omitidas: 0,
			codigo_error: '23514',
		};
		expect(parseResultadoGeneracion(failed).resultado).toBe('fallido');
		expect(() => parseResultadoGeneracion({ ...failed, cuotas_generadas: 1 })).toThrow();
		expect(() => parseResultadoGeneracion({ ...failed, codigo_error: 'texto libre' })).toThrow();
	});
	test('rechaza alias, claves adicionales y estados inventados', () => {
		expect(() => parseResultadoGeneracion({ ...response, ok: true })).toThrow();
		expect(() => parseResultadoGeneracion({ ...response, resultado: 'exitoso' })).toThrow();
		const { job_id: _removed, ...missing } = response;
		expect(() => parseResultadoGeneracion({ ...missing, id })).toThrow();
	});
	test('valida UUID, período e importes de conteo enteros', () => {
		for (const changes of [
			{ job_id: 'otro' },
			{ periodo_mes: 13 },
			{ periodo_anio: 2000 },
			{ cuotas_generadas: -1 },
			{ cuotas_omitidas: 1.5 },
			{ cuotas_generadas: '4' },
		]) {
			expect(() => parseResultadoGeneracion({ ...response, ...changes })).toThrow();
		}
	});
	test('el período proviene de una fecha real, incluso cambio de año/bisiesto', () => {
		expect(periodoCuotasDeFecha('2026-12-31')).toEqual({ mes: 12, anio: 2026 });
		expect(periodoCuotasDeFecha('2027-01-01')).toEqual({ mes: 1, anio: 2027 });
		expect(periodoCuotasDeFecha('2028-02-29')).toEqual({ mes: 2, anio: 2028 });
		for (const date of ['2026-02-29', '2026-13-01', '2026-04-31', '23/10/2026', null]) {
			expect(() => periodoCuotasDeFecha(date)).toThrow();
		}
	});
	test('la confirmación se contrasta con log persistido, no sólo con la respuesta', () => {
		expect(
			verificarResultadoGeneracion(parseResultadoGeneracion(response), parseJobCuotas(job)).id,
		).toBe(id);
		for (const changes of [
			{ id: 'f2714767-1557-4fd9-ae8a-0af868542263' },
			{ periodo_mes: 11 },
			{ estado: 'fallido', cuotas_generadas: 0, cuotas_omitidas: 0 },
			{ cuotas_omitidas: 9 },
		]) {
			expect(() =>
				verificarResultadoGeneracion(
					parseResultadoGeneracion(response),
					parseJobCuotas({ ...job, ...changes }),
				),
			).toThrow();
		}
	});
	test('un log incompleto o contador desconocido no se presenta como completado', () => {
		expect(parseJobCuotas({ ...job, estado: 'procesando', fecha_fin: null }).estado).toBe(
			'procesando',
		);
		expect(() => parseJobCuotas({ ...job, fecha_fin: null })).toThrow();
		expect(() => parseJobCuotas({ ...job, cuotas_generadas: null })).toThrow();
		expect(() => parseJobCuotas({ ...job, estado: 'fallido' })).toThrow();
	});
	test('el intento persistido pertenece al usuario y conserva su período original', () => {
		const ticket = {
			usuarioId: id,
			periodo: { mes: 12, anio: 2026 },
			iniciadoEn: '2026-12-31T23:59:59Z',
		};
		expect(parseIntentoGeneracion(ticket, id)).toEqual(ticket);
		expect(parseIntentoGeneracion(ticket, 'otro-usuario')).toBeNull();
		expect(parseIntentoGeneracion({ ...ticket, periodo: { mes: 0, anio: 2026 } }, id)).toBeNull();
		expect(parseIntentoGeneracion({ ...ticket, iniciadoEn: 'inválida' }, id)).toBeNull();
	});
});
