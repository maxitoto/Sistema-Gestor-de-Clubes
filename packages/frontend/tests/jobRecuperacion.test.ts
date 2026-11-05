import { describe, expect, test } from 'bun:test';
import type { JobCuotas } from '../src/entities/job-cuotas';
import {
	type IntentoGeneracion,
	parseIntentoGeneracion,
	resolverRecuperacionGeneracion,
} from '../src/features/generar-cuotas/model/intentoGeneracion';

const actor = '9b77f519-c144-4e0e-9ea8-6642455e28f2';
const oldId = '17486d01-83d0-44bc-a03c-3ea2cd27b90a';
const newId = 'b41fc064-592c-4212-a539-cd65d1be4ed2';
const otherId = '9bca76cf-d364-40be-8f9c-487505bf0fb5';
const ticket: IntentoGeneracion = {
	usuarioId: actor,
	periodo: { mes: 12, anio: 2026 },
	iniciadoEn: '2027-01-01T02:59:59Z',
	baselineJobId: oldId,
	baselineJobEstado: 'fallido',
};
const current = { mes: 1, anio: 2027 };
const row = (changes: Partial<JobCuotas> = {}): JobCuotas => ({
	id: newId,
	periodo_mes: 1,
	periodo_anio: 2027,
	estado: 'exitoso',
	cuotas_generadas: 4,
	cuotas_omitidas: 2,
	fecha_inicio: '2027-01-01T03:00:01Z',
	fecha_fin: '2027-01-01T03:00:02Z',
	...changes,
});

describe('recuperación mensual sin atribuir corridas históricas', () => {
	test('ticket nuevo conserva baseline y el formato anterior sigue legible sin inventarlo', () => {
		expect(parseIntentoGeneracion(ticket, actor)).toEqual(ticket);
		const { baselineJobId: _id, baselineJobEstado: _state, ...legacy } = ticket;
		expect(parseIntentoGeneracion(legacy, actor)).toEqual(legacy);
		expect(parseIntentoGeneracion({ ...ticket, baselineJobId: 'inválido' }, actor)).toBeNull();
	});
	test('cambio de año con fallo viejo recupera el éxito del mes actual sin depender del orden', () => {
		const old = row({
			id: oldId,
			periodo_mes: 12,
			periodo_anio: 2026,
			estado: 'fallido',
			cuotas_generadas: 0,
			cuotas_omitidas: 0,
			fecha_inicio: '2026-12-02T03:00:00Z',
		});
		expect(resolverRecuperacionGeneracion(ticket, current, [old, row()])).toEqual({
			estado: 'recuperado',
			job: row(),
		});
		expect(resolverRecuperacionGeneracion(ticket, current, [row(), old])).toEqual({
			estado: 'recuperado',
			job: row(),
		});
	});
	test('un fallo anterior al intento no se atribuye aunque no coincida su ID', () => {
		expect(
			resolverRecuperacionGeneracion(ticket, current, [
				row({
					id: otherId,
					estado: 'fallido',
					cuotas_generadas: 0,
					cuotas_omitidas: 0,
					fecha_inicio: '2026-12-31T03:00:00Z',
				}),
			]),
		).toEqual({ estado: 'ambiguo' });
	});
	test('dos terminales plausibles de distintos períodos conservan incertidumbre', () => {
		const prior = row({
			id: otherId,
			periodo_mes: 12,
			periodo_anio: 2026,
			fecha_inicio: '2027-01-01T02:59:59Z',
		});
		expect(resolverRecuperacionGeneracion(ticket, current, [prior, row()])).toEqual({
			estado: 'ambiguo',
		});
	});
	test('ticket antiguo no atribuye un fallo y sí permite consultar un único éxito autoritativo', () => {
		const { baselineJobId: _id, baselineJobEstado: _state, ...legacy } = ticket;
		expect(
			resolverRecuperacionGeneracion(legacy, current, [
				row({ estado: 'fallido', cuotas_generadas: 0, cuotas_omitidas: 0 }),
			]),
		).toEqual({ estado: 'ambiguo' });
		expect(resolverRecuperacionGeneracion(legacy, current, [row()])).toEqual({
			estado: 'recuperado',
			job: row(),
		});
	});
	test('un fallo nuevo posterior al intento se recupera como fallo, nunca como éxito', () => {
		const failed = row({ estado: 'fallido', cuotas_generadas: 0, cuotas_omitidas: 0 });
		expect(resolverRecuperacionGeneracion(ticket, current, [failed])).toEqual({
			estado: 'recuperado',
			job: failed,
		});
	});
	test('baseline que estaba procesando puede recuperarse con el mismo ID al finalizar', () => {
		const processingTicket = { ...ticket, baselineJobEstado: 'procesando' as const };
		const failed = row({
			id: oldId,
			periodo_mes: 12,
			periodo_anio: 2026,
			estado: 'fallido',
			cuotas_generadas: 0,
			cuotas_omitidas: 0,
			fecha_inicio: '2027-01-01T02:59:58Z',
		});
		expect(resolverRecuperacionGeneracion(processingTicket, current, [failed])).toEqual({
			estado: 'recuperado',
			job: failed,
		});
	});
	test('procesando o ausencia no se anuncian como una corrida completada', () => {
		expect(
			resolverRecuperacionGeneracion(ticket, current, [
				row({ estado: 'procesando', fecha_fin: null }),
			]),
		).toEqual({ estado: 'procesando' });
		expect(resolverRecuperacionGeneracion(ticket, current, [null])).toEqual({ estado: 'ausente' });
	});
	test('filtra períodos ajenos y no duplica el mismo job leído dos veces', () => {
		expect(
			resolverRecuperacionGeneracion(ticket, current, [
				row({ periodo_mes: 10, periodo_anio: 2026 }),
			]),
		).toEqual({ estado: 'ausente' });
		expect(resolverRecuperacionGeneracion(ticket, current, [row(), row()])).toEqual({
			estado: 'recuperado',
			job: row(),
		});
	});
});
