import { describe, expect, test } from 'bun:test';
import {
	type DocumentoComprobante,
	type EstadoFiscalComprobante,
	parseDocumentoComprobante,
	parseEstadoFiscal,
} from '../src/entities/comprobante/model/fiscalContract';

const id = '1176bb15-c306-466b-8d7c-416f3295c37b';
const other = '2f3cb5ea-c177-4ab3-b462-2fe277f236bd';
const payment = 'b9999999-9999-9999-9999-999999999999';
const base = 'http://127.0.0.1:54321';
const hash = 'ab'.repeat(32);
const pending: EstadoFiscalComprobante = {
	comprobanteId: id,
	pagoId: payment,
	cobroConfirmado: true,
	estadoFiscal: 'pendiente_cae',
	numero: null,
	cae: null,
	vencimiento: null,
	operacion: null,
	emisionDisponible: false,
	aviso: 'La conexión externa de homologación está deshabilitada.',
	pdfVersion: 'provisional',
};
const authorized: EstadoFiscalComprobante = {
	...pending,
	estadoFiscal: 'valido',
	numero: '17',
	cae: '12345678901234',
	vencimiento: '2026-11-03',
	operacion: 'autorizado',
	aviso: null,
	pdfVersion: 'autorizado',
};
function document(
	version: 'provisional' | 'autorizado' = 'provisional',
	target = id,
): DocumentoComprobante {
	const storagePath = `comprobantes/${target}/${version}/${hash}.pdf`;
	return {
		comprobanteId: target,
		version,
		storagePath,
		url: `${base}/storage/v1/object/sign/club-archivos/${storagePath}?token=TOKEN_SINTETICO_NO_USABLE`,
		expiresIn: 600,
		nombreArchivo: `comprobante-${target}-${version}.pdf`,
	};
}

describe('frontera frontend de comprobantes fiscales', () => {
	test('dinero confirmado y CAE pendiente se conservan separados', () => {
		expect(parseEstadoFiscal(pending, id)).toEqual(pending);
		expect(
			parseEstadoFiscal({ ...pending, estadoFiscal: 'fallido', operacion: 'rechazado' }, id)
				.cobroConfirmado,
		).toBe(true);
	});
	test('autorización completa coincide con campos públicos del backend', () => {
		expect(parseEstadoFiscal(authorized, id)).toEqual(authorized);
		expect(parseEstadoFiscal({ ...pending, operacion: 'desconocido' }, id).operacion).toBe(
			'desconocido',
		);
	});
	test('estado cruzado, ID ilegible y payload no objeto se rechazan', () => {
		expect(() => parseEstadoFiscal({ ...pending, comprobanteId: other }, id)).toThrow();
		expect(() => parseEstadoFiscal(pending, 'no-es-id')).toThrow();
		expect(() => parseEstadoFiscal({ ...pending, pagoId: 'pago-sin-identidad' }, id)).toThrow();
		for (const value of [null, [], 'estado', 5, undefined]) {
			expect(() => parseEstadoFiscal(value, id)).toThrow();
		}
	});
	test('estados ajenos al contrato y booleanos coercibles no se aceptan', () => {
		for (const values of [
			{ estadoFiscal: 'aprobado_por_ui' },
			{ operacion: 'reintentar_siempre' },
			{ cobroConfirmado: 'true' },
			{ emisionDisponible: 1 },
			{ pdfVersion: 'oficial' },
			{ aviso: undefined },
		]) {
			expect(() => parseEstadoFiscal({ ...pending, ...values }, id)).toThrow();
		}
	});
	test('un estado válido no puede anunciar autorización incompleta o malformada', () => {
		for (const values of [
			{ numero: null },
			{ cae: null },
			{ vencimiento: null },
			{ numero: '0' },
			{ numero: '-1' },
			{ numero: '17.5' },
			{ numero: 'número reservado' },
			{ cae: 'sin-cae' },
			{ cae: '123' },
			{ cae: '00000000000000' },
			{ vencimiento: '03/11/2026' },
			{ vencimiento: '2026-02-31' },
			{ vencimiento: '2026-13-01' },
		]) {
			expect(() => parseEstadoFiscal({ ...authorized, ...values }, id)).toThrow();
		}
	});
	test('UUID de PostgreSQL precargados no se restringen a la variante RFC', () => {
		const legacy = 'a4444444-4444-4444-4444-444444444444';
		expect(parseEstadoFiscal({ ...pending, comprobanteId: legacy }, legacy).comprobanteId).toBe(
			legacy,
		);
		expect(
			parseDocumentoComprobante(document('provisional', legacy), legacy, base).comprobanteId,
		).toBe(legacy);
	});
	test('documentos de ambas versiones aceptan la referencia privada versionada del backend', () => {
		for (const version of ['provisional', 'autorizado'] as const) {
			expect(parseDocumentoComprobante(document(version), id, base)).toEqual(document(version));
		}
	});
	test('URL externa, javascript, credenciales y fragmento no pasan por documento local', () => {
		const source = document();
		for (const url of [
			source.url.replace(base, 'https://otro.example.test'),
			source.url.replace(base, 'http://127.0.0.1:55321'),
			'javascript:alert(1)',
			source.url.replace('http://', 'http://usuario:clave@'),
			`${source.url}#otro`,
			'/storage/v1/object/sign/relativo?token=x',
		]) {
			expect(() => parseDocumentoComprobante({ ...source, url }, id, base)).toThrow();
		}
	});
	test('ruta de otro comprobante, bucket, versión o archivo no coincide', () => {
		const source = document();
		expect(() => parseDocumentoComprobante(document('provisional', other), id, base)).toThrow();
		expect(() =>
			parseDocumentoComprobante(
				{ ...source, storagePath: source.storagePath.replace(id, other) },
				id,
				base,
			),
		).toThrow();
		for (const url of [
			source.url.replace(id, other),
			source.url.replace('club-archivos', 'otro-bucket'),
			source.url.replace('/provisional/', '/autorizado/'),
			source.url.replace(hash, 'cd'.repeat(32)),
		]) {
			expect(() => parseDocumentoComprobante({ ...source, url }, id, base)).toThrow();
		}
		expect(() =>
			parseDocumentoComprobante(
				{ ...source, storagePath: source.storagePath.replace(hash, 'a') },
				id,
				base,
			),
		).toThrow();
	});
	test('token firmado requiere un valor único no vacío en el enlace', () => {
		const source = document();
		for (const url of [
			source.url.split('?')[0],
			`${source.url.split('?')[0]}?token=`,
			`${source.url.split('?')[0]}?token=%20%20`,
			`${source.url}&token=OTRO_TOKEN`,
		]) {
			expect(() => parseDocumentoComprobante({ ...source, url }, id, base)).toThrow();
		}
	});
	test('TTL, versión y nombre corresponden al mismo documento', () => {
		const source = document();
		for (const expiresIn of [0, -1, 599, 601, 3600, '600', undefined]) {
			expect(() => parseDocumentoComprobante({ ...source, expiresIn }, id, base)).toThrow();
		}
		expect(() => parseDocumentoComprobante({ ...source, version: 'otra' }, id, base)).toThrow();
		expect(() =>
			parseDocumentoComprobante(
				{ ...source, nombreArchivo: `comprobante-${other}-provisional.pdf` },
				id,
				base,
			),
		).toThrow();
		expect(() =>
			parseDocumentoComprobante(
				{ ...source, nombreArchivo: `comprobante-${id}-autorizado.pdf` },
				id,
				base,
			),
		).toThrow();
	});
});
