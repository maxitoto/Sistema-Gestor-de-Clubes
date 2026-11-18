import { UUID_CORREO } from '#shared/lib/comunicaciones';
export interface EnvioCorreo {
	id: string;
	asunto: string;
	fecha_envio: string;
	estado: 'enviado' | 'fallido' | 'procesando';
	origen: 'manual' | 'automatico';
	tipo: 'general' | 'deuda' | 'transaccional';
	destinatarios_count: number;
	autor_nombre: string | null;
	cuerpo?: string;
}
export interface DestinatarioCorreo {
	id: string;
	email: string | null;
	nombre_snapshot: string | null;
	apellido_snapshot: string | null;
	asunto_snapshot: string;
	cuerpo_snapshot: string;
	estado_envio: 'pendiente' | 'procesando' | 'aceptado' | 'fallido' | 'excluido' | 'incierto';
	entrega_estado: 'sin_confirmar' | 'demorada' | 'entregada' | 'rebote_duro' | 'fallida';
	motivo: string | null;
	aceptado_en: string | null;
	ultimo_evento_en: string | null;
}
export interface CriteriosHistorial {
	page: number;
	pageSize: 20 | 50 | 100;
	estado: 'todos' | 'enviado' | 'fallido' | 'procesando';
	desde: string;
	hasta: string;
	sortBy: 'fecha_envio' | 'asunto' | 'destinatarios_count' | 'estado';
	sortOrder: 'asc' | 'desc';
}
export const criteriosHistorialIniciales: CriteriosHistorial = {
	page: 1,
	pageSize: 20,
	estado: 'todos',
	desde: '',
	hasta: '',
	sortBy: 'fecha_envio',
	sortOrder: 'desc',
};
type RegistroCorreo = Record<string, unknown> & {
	[K in
		| 'id'
		| 'asunto'
		| 'fecha_envio'
		| 'estado'
		| 'origen'
		| 'tipo'
		| 'destinatarios_count'
		| 'autor_nombre'
		| 'cuerpo'
		| 'email'
		| 'nombre_snapshot'
		| 'apellido_snapshot'
		| 'asunto_snapshot'
		| 'cuerpo_snapshot'
		| 'estado_envio'
		| 'entrega_estado'
		| 'motivo'
		| 'aceptado_en'
		| 'ultimo_evento_en'
		| 'envios'
		| 'page'
		| 'pageSize'
		| 'total'
		| 'envio'
		| 'destinatarios'
		| 'candidatos'
		| 'deuda_pendiente'
		| 'nombre'
		| 'apellido'
		| 'dni'
		| 'acepta_comunicaciones'
		| 'email_invalido'
		| 'moroso'
		| 'deportes'
		| 'elegible'
		| 'idsFiltrados'
		| 'elegibles'
		| 'excluidos']?: unknown;
};
const record = (v: unknown): RegistroCorreo => {
	if (!v || typeof v !== 'object' || Array.isArray(v)) {
		throw new Error('La respuesta de comunicaciones no es válida.');
	}
	return v as RegistroCorreo;
};
const text = (v: unknown): string => {
	if (typeof v !== 'string') {
		throw new Error('Falta información del envío.');
	}
	return v;
};
const nullable = (v: unknown): string | null => (v === null || v === undefined ? null : text(v));
const integer = (v: unknown): number => {
	if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) {
		throw new Error('El total de comunicaciones no es válido.');
	}
	return v;
};
const id = (v: unknown) => {
	const s = text(v);
	if (!UUID_CORREO.test(s)) {
		throw new Error('La referencia del envío no es válida.');
	}
	return s;
};
const enumeration = <T extends string>(v: unknown, allowed: readonly T[]): T => {
	if (!allowed.includes(v as T)) {
		throw new Error('El estado del correo no es válido.');
	}
	return v as T;
};
const date = (v: unknown) => {
	const s = text(v);
	if (!Number.isFinite(Date.parse(s))) {
		throw new Error('La fecha del envío no es válida.');
	}
	return s;
};
export function parseEnvioCorreo(input: unknown): EnvioCorreo {
	const x = record(input);
	return {
		id: id(x.id),
		asunto: text(x.asunto),
		fecha_envio: date(x.fecha_envio),
		estado: enumeration(x.estado, ['enviado', 'fallido', 'procesando']),
		origen: enumeration(x.origen, ['manual', 'automatico']),
		tipo: enumeration(x.tipo, ['general', 'deuda', 'transaccional']),
		destinatarios_count: integer(x.destinatarios_count),
		autor_nombre: nullable(x.autor_nombre),
		...(x.cuerpo !== undefined ? { cuerpo: text(x.cuerpo) } : {}),
	};
}
export function parseDestinatarioCorreo(input: unknown): DestinatarioCorreo {
	const x = record(input);
	return {
		id: id(x.id),
		email: nullable(x.email),
		nombre_snapshot: nullable(x.nombre_snapshot),
		apellido_snapshot: nullable(x.apellido_snapshot),
		asunto_snapshot: text(x.asunto_snapshot),
		cuerpo_snapshot: text(x.cuerpo_snapshot),
		estado_envio: enumeration(x.estado_envio, [
			'pendiente',
			'procesando',
			'aceptado',
			'fallido',
			'excluido',
			'incierto',
		]),
		entrega_estado: enumeration(x.entrega_estado, [
			'sin_confirmar',
			'demorada',
			'entregada',
			'rebote_duro',
			'fallida',
		]),
		motivo: nullable(x.motivo),
		aceptado_en: x.aceptado_en ? date(x.aceptado_en) : null,
		ultimo_evento_en: x.ultimo_evento_en ? date(x.ultimo_evento_en) : null,
	};
}
export function parseHistorial(input: unknown) {
	const x = record(input);
	if (!Array.isArray(x.envios)) {
		throw new Error('No se recibió el historial.');
	}
	return {
		envios: x.envios.map(parseEnvioCorreo),
		page: integer(x.page),
		pageSize: integer(x.pageSize),
		total: integer(x.total),
	};
}
export function parseDetalleEnvio(input: unknown) {
	const x = record(input);
	if (!Array.isArray(x.destinatarios)) {
		throw new Error('No se recibieron los destinatarios.');
	}
	return {
		envio: parseEnvioCorreo(x.envio),
		destinatarios: x.destinatarios.map(parseDestinatarioCorreo),
		page: integer(x.page),
		pageSize: integer(x.pageSize),
		total: integer(x.total),
	};
}
export type TipoAviso = 'general' | 'deuda';
export interface CriteriosCandidatos {
	page: number;
	pageSize: 20 | 50 | 100;
	tipo: TipoAviso;
	busqueda: string;
	deporteId: string;
	categoriaId: string;
	estadoPago: 'todos' | 'moroso' | 'aldia';
	incluirDesuscriptos: boolean;
}
export const criteriosCandidatosIniciales: CriteriosCandidatos = {
	page: 1,
	pageSize: 20,
	tipo: 'general',
	busqueda: '',
	deporteId: '',
	categoriaId: '',
	estadoPago: 'todos',
	incluirDesuscriptos: false,
};
export interface CandidatoCorreo {
	id: string;
	nombre: string;
	apellido: string;
	dni: string;
	email: string | null;
	estado: 'activo' | 'inactivo';
	acepta_comunicaciones: boolean;
	email_invalido: boolean;
	deuda_pendiente: string;
	moroso: boolean;
	deportes: string;
	elegible: boolean;
	motivo: string | null;
}
export interface ResultadoCandidatos {
	candidatos: CandidatoCorreo[];
	page: number;
	pageSize: number;
	total: number;
	elegibles: number;
	excluidos: number;
	idsFiltrados?: string[];
}
export function parseCandidatos(input: unknown): ResultadoCandidatos {
	const x = record(input);
	if (!Array.isArray(x.candidatos)) {
		throw new Error('No se recibió la selección de socios.');
	}
	const candidatos = x.candidatos.map((v) => {
		const p = record(v);
		for (const k of ['acepta_comunicaciones', 'email_invalido', 'moroso', 'elegible']) {
			if (typeof p[k] !== 'boolean') {
				throw new Error('El estado del destinatario no es válido.');
			}
		}
		const deuda = text(p.deuda_pendiente);
		if (!/^\d+(\.\d{1,2})?$/.test(deuda)) {
			throw new Error('La deuda del destinatario no es válida.');
		}
		return {
			id: id(p.id),
			nombre: text(p.nombre),
			apellido: text(p.apellido),
			dni: text(p.dni),
			email: nullable(p.email),
			estado: enumeration(p.estado, ['activo', 'inactivo']),
			acepta_comunicaciones: p.acepta_comunicaciones as boolean,
			email_invalido: p.email_invalido as boolean,
			deuda_pendiente: deuda,
			moroso: p.moroso as boolean,
			deportes: text(p.deportes),
			elegible: p.elegible as boolean,
			motivo: nullable(p.motivo),
		};
	});
	let ids: string[] | undefined;
	if (x.idsFiltrados !== undefined) {
		if (!Array.isArray(x.idsFiltrados) || x.idsFiltrados.length > 1000) {
			throw new Error('La selección supera el límite de 1000 socios.');
		}
		ids = x.idsFiltrados.map(id);
		if (new Set(ids).size !== ids.length) {
			throw new Error('La selección contiene socios repetidos.');
		}
	}
	const total = integer(x.total),
		elegibles = integer(x.elegibles),
		excluidos = integer(x.excluidos),
		pageSize = integer(x.pageSize);
	if (
		elegibles + excluidos !== total ||
		candidatos.length > pageSize ||
		new Set(candidatos.map((p) => p.id)).size !== candidatos.length ||
		candidatos.some((p) => p.elegible !== (p.motivo === null)) ||
		(ids && ids.length !== total)
	) {
		throw new Error('Los totales o la selección completa no coinciden con la consulta.');
	}
	return {
		candidatos,
		page: integer(x.page),
		pageSize: integer(x.pageSize),
		total: integer(x.total),
		elegibles: integer(x.elegibles),
		excluidos: integer(x.excluidos),
		...(ids ? { idsFiltrados: ids } : {}),
	};
}
