import { describe, expect, spyOn, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
	parseCandidatos,
	parseDestinatarioCorreo,
	parseEnvioCorreo,
	parseHistorial,
} from '../src/entities/comunicacion/model/comunicacionContract';
import { RequestIdentity } from '../src/features/send-email/model/requestIdentity';
import {
	etiquetaDespacho,
	etiquetaEntrega,
	fechaCorreo,
	idsCanonicosCorreo,
	rangoDiasCorreo,
	validarPlantilla,
	validarTextoCorreo,
	vistaPreviaCorreo,
} from '../src/shared/lib/comunicaciones';

const id = (i: number) => `00000000-0000-0000-0000-${i.toString(16).padStart(12, '0')}`;
const candidate = (i = 1) => ({
	id: id(i),
	nombre: 'Persona',
	apellido: 'Sintética',
	dni: '30000001',
	email: 'persona@example.test',
	estado: 'activo',
	acepta_comunicaciones: true,
	email_invalido: false,
	deuda_pendiente: '1000.00',
	moroso: false,
	deportes: 'Actividad de ejemplo',
	elegible: true,
	motivo: null,
});
const candidates = () => ({
	candidatos: [candidate()],
	page: 1,
	pageSize: 20,
	total: 21,
	elegibles: 20,
	excluidos: 1,
});
const envio = () => ({
	id: id(1),
	asunto: 'Aviso conservado',
	fecha_envio: '2026-10-26T03:00:00Z',
	estado: 'procesando',
	origen: 'manual',
	tipo: 'general',
	destinatarios_count: 21,
	autor_nombre: 'Responsable sintético',
});
const destinatario = () => ({
	id: id(2),
	email: 'historico@example.test',
	nombre_snapshot: 'Nombre de antes',
	apellido_snapshot: 'Apellido de antes',
	asunto_snapshot: 'Asunto histórico',
	cuerpo_snapshot: 'Mensaje {{histórico}} literal',
	estado_envio: 'aceptado',
	entrega_estado: 'sin_confirmar',
	motivo: null,
	aceptado_en: '2026-10-26T03:01:00Z',
	ultimo_evento_en: null,
});
describe('comunicaciones texto plano y plantillas', () => {
	test('permite únicamente las cuatro etiquetas completas', () => {
		expect(
			validarPlantilla({
				nombre_interno: 'Aviso',
				asunto: 'Hola {{nombre}}',
				cuerpo: '{{apellido}} {{deporte}} {{deuda}}',
			}),
		).toBeNull();
		for (const body of ['{{telefono}}', '{{nombre}', '{{ nombre }}', 'nombre}}']) {
			expect(validarTextoCorreo('Aviso', body)).not.toBeNull();
		}
	});
	test('rechaza vacíos, límites y saltos de cabecera', () => {
		for (const p of [
			{ nombre_interno: ' ', asunto: 'A', cuerpo: 'B' },
			{ nombre_interno: 'N', asunto: 'A\nB', cuerpo: 'B' },
			{ nombre_interno: 'N', asunto: 'A'.repeat(256), cuerpo: 'B' },
			{ nombre_interno: 'N', asunto: 'A', cuerpo: ' '.repeat(10) },
			{ nombre_interno: 'N', asunto: 'A', cuerpo: 'B'.repeat(10001) },
		]) {
			expect(validarPlantilla(p)).not.toBeNull();
		}
	});
	test('preview reemplaza como texto y React escapa contenido HTML', () => {
		const text = vistaPreviaCorreo('<script>{{nombre}}</script>', { nombre: '<b>Persona</b>' });
		expect(text).toBe('<script><b>Persona</b></script>');
		const html = renderToStaticMarkup(createElement('div', null, text));
		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;');
	});
});
describe('comunicaciones selección y recuperación', () => {
	test('orden, mayúsculas y repeticiones no crean identidad distinta', () => {
		const identity = new RequestIdentity();
		let count = 0;
		const make = () => id(++count);
		const first = {
			actor: id(5),
			cuerpo: 'Mensaje',
			sociosIds: idsCanonicosCorreo([id(2).toUpperCase(), id(1), id(2)]),
		};
		const retry = {
			actor: id(5),
			cuerpo: 'Mensaje',
			sociosIds: idsCanonicosCorreo([id(1), id(2)]),
		};
		expect(identity.forPayload(first, make)).toBe(identity.forPayload(retry, make));
		expect(count).toBe(1);
		expect(identity.forPayload({ ...first, cuerpo: 'Otro mensaje' }, make)).not.toBe(
			identity.forPayload(first, make),
		);
	});
	test('otra cuenta obtiene otra solicitud aunque el texto sea igual', () => {
		const identity = new RequestIdentity();
		let count = 0;
		const make = () => id(++count);
		const first = identity.forPayload({ actor: id(4), cuerpo: 'Mismo' }, make);
		expect(identity.forPayload({ actor: id(5), cuerpo: 'Mismo' }, make)).not.toBe(first);
	});
	test('selección requiere 1–1000 IDs completos, no truncamiento', () => {
		expect(() => idsCanonicosCorreo([])).toThrow();
		expect(() => idsCanonicosCorreo(['otro'])).toThrow();
		expect(() => idsCanonicosCorreo(Array.from({ length: 1001 }, (_, i) => id(i + 1)))).toThrow();
		expect(idsCanonicosCorreo(Array.from({ length: 1000 }, (_, i) => id(i + 1)))).toHaveLength(
			1000,
		);
	});
	test('página visible no se interpreta como todos los filtrados', () => {
		const v = parseCandidatos(candidates());
		expect(v.candidatos).toHaveLength(1);
		expect(v.total).toBe(21);
		expect(v.idsFiltrados).toBeUndefined();
	});
	test('selección completa conserva exclusiones y todas las páginas', () => {
		const v = parseCandidatos({
			...candidates(),
			idsFiltrados: Array.from({ length: 21 }, (_, i) => id(i + 1)),
		});
		expect(v.idsFiltrados).toHaveLength(21);
		expect(v.elegibles + v.excluidos).toBe(v.total);
	});
	test('IDs incompletos, repetidos y totales incoherentes fallan cerrados', () => {
		for (const v of [
			{ ...candidates(), idsFiltrados: [id(1)] },
			{ ...candidates(), total: 2, elegibles: 1, excluidos: 1, idsFiltrados: [id(1), id(1)] },
			{ ...candidates(), total: 20 },
			{ ...candidates(), candidatos: [{ ...candidate(), elegible: 'true' }] },
			{ ...candidates(), candidatos: [{ ...candidate(), elegible: false, motivo: null }] },
		]) {
			expect(() => parseCandidatos(v)).toThrow();
		}
	});
});
describe('comunicaciones historial y fechas', () => {
	test('días Buenos Aires usan inicio inclusivo y fin del día siguiente exclusivo', () => {
		expect(rangoDiasCorreo('2026-10-25', '2026-10-25')).toEqual({
			desde: '2026-10-25T03:00:00.000Z',
			hasta: '2026-10-26T03:00:00.000Z',
		});
		expect(rangoDiasCorreo('', '')).toEqual({});
	});
	test('fechas inexistentes o rangos invertidos no se consultan', () => {
		for (const [a, b] of [
			['2026-02-30', ''],
			['2026-10-26', '2026-10-25'],
			['hoy', ''],
		]) {
			expect(() => rangoDiasCorreo(a ?? '', b ?? '')).toThrow();
		}
	});
	test('aceptación y entrega no se convierten en una sola etiqueta', () => {
		const value = parseDestinatarioCorreo(destinatario());
		expect(etiquetaDespacho(value.estado_envio)).toBe('Aceptado por proveedor');
		expect(etiquetaEntrega(value.entrega_estado)).toBe('Sin entrega confirmada');
		expect(etiquetaDespacho('incierto')).toBe('Aceptación incierta');
		expect(etiquetaEntrega('rebote_duro')).toBe('Rebote permanente');
	});
	test('contenido histórico ignora cambios actuales y datos técnicos extra', () => {
		const value = parseDestinatarioCorreo({
			...destinatario(),
			email_actual: 'nuevo@example.test',
			firma_baja: 'no-visible',
			provider_message_id: 'privado',
		});
		expect(value.email).toBe('historico@example.test');
		expect(value.cuerpo_snapshot).toBe('Mensaje {{histórico}} literal');
		expect(value).not.toHaveProperty('firma_baja');
		expect(value).not.toHaveProperty('provider_message_id');
	});
	test('autor no disponible no se inventa desde un dato actual', () => {
		expect(parseEnvioCorreo({ ...envio(), autor_nombre: null }).autor_nombre).toBeNull();
	});
	test('estado desconocido y total coercible no se rotulan como éxito', () => {
		expect(() => parseEnvioCorreo({ ...envio(), estado: 'entregado' })).toThrow();
		expect(() =>
			parseHistorial({ envios: [envio()], page: 1, pageSize: 20, total: '1' }),
		).toThrow();
		expect(() =>
			parseDestinatarioCorreo({ ...destinatario(), estado_envio: 'entregado' }),
		).toThrow();
	});
});

describe('fecha de correo compartida por historial y exportación', () => {
	test('mantiene el día del club al cruzar medianoche', () => {
		expect(fechaCorreo('2050-05-02T02:59:00Z')).toMatch(/^1\/5\/50, /u);
		expect(fechaCorreo('2050-05-02T03:00:00Z')).toMatch(/^2\/5\/50, /u);
	});
	test('conserva ausencia y error de fecha inválida', () => {
		expect(fechaCorreo(null)).toBe('Sin información');
		expect(fechaCorreo('')).toBe('Sin información');
		expect(() => fechaCorreo('fecha-invalida')).toThrow(RangeError);
	});
	test('1001 filas reutilizan Intl sin modificar texto del historial', () => {
		const fecha = '2050-05-01T03:30:00Z';
		const esperado = new Intl.DateTimeFormat('es-AR', {
			dateStyle: 'short',
			timeStyle: 'short',
			timeZone: 'America/Argentina/Buenos_Aires',
		}).format(new Date(fecha));
		const construir = spyOn(Intl, 'DateTimeFormat');
		try {
			const resultados = Array.from({ length: 1001 }, () => fechaCorreo(fecha));
			expect(resultados).toHaveLength(1001);
			expect(new Set(resultados)).toEqual(new Set([esperado]));
			expect(construir).not.toHaveBeenCalled();
		} finally {
			construir.mockRestore();
		}
	});
});
