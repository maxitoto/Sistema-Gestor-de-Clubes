import { createHumanRequestClient } from '#shared/api/humanRequest';
import { rangoDiasCorreo, UUID_CORREO } from '#shared/lib/comunicaciones';
import {
	type CriteriosCandidatos,
	type CriteriosHistorial,
	parseCandidatos,
	parseDetalleEnvio,
	parseHistorial,
} from '../model/comunicacionContract';
export async function errorComunicaciones(error: unknown): Promise<Error> {
	const ctx = error && typeof error === 'object' && 'context' in error ? error.context : null;
	if (ctx instanceof Response) {
		if (ctx.status === 401) {
			return new Error('La sesión venció. Ingresá nuevamente.');
		}
		if (ctx.status === 403) {
			return new Error('Tu cuenta no está habilitada para consultar comunicaciones.');
		}
		if ([400, 409].includes(ctx.status)) {
			const x: unknown = await ctx
				.clone()
				.json()
				.catch(() => null);
			if (x && typeof x === 'object' && 'error' in x && typeof x.error === 'string') {
				return new Error(x.error);
			}
		}
	}
	return new Error('No se pudo consultar comunicaciones. Volvé a intentarlo.');
}
export async function getHistorialCorreo(
	c: CriteriosHistorial,
	actorId: string,
	signal?: AbortSignal,
) {
	const rango = rangoDiasCorreo(c.desde, c.hasta);
	const params = new URLSearchParams({
		page: String(c.page),
		pageSize: String(c.pageSize),
		...(c.estado !== 'todos' ? { estado: c.estado } : {}),
		sortBy: c.sortBy,
		sortOrder: c.sortOrder,
		...(rango.desde ? { desde: rango.desde } : {}),
		...(rango.hasta ? { hasta: rango.hasta } : {}),
	});
	const db = await createHumanRequestClient(actorId, signal);
	const { data, error } = await db.functions.invoke(`comunicaciones/historial?${params}`, {
		method: 'GET',
		...(signal ? { signal } : {}),
	});
	if (error) {
		throw await errorComunicaciones(error);
	}
	const result = parseHistorial(data);
	if (result.page !== c.page || result.pageSize !== c.pageSize) {
		throw new Error('La página recibida no coincide con la consulta de correos.');
	}
	return result;
}
export async function getDetalleCorreo(
	id: string,
	page: number,
	pageSize: number,
	actorId: string,
	signal?: AbortSignal,
) {
	if (!UUID_CORREO.test(id)) {
		throw new Error('El envío no es válido.');
	}
	const db = await createHumanRequestClient(actorId, signal);
	const { data, error } = await db.functions.invoke(
		`comunicaciones/historial/${id}?page=${page}&pageSize=${pageSize}`,
		{ method: 'GET', ...(signal ? { signal } : {}) },
	);
	if (error) {
		throw await errorComunicaciones(error);
	}
	const result = parseDetalleEnvio(data);
	if (result.envio.id !== id || result.page !== page || result.pageSize !== pageSize) {
		throw new Error('El detalle recibido no coincide con el envío.');
	}
	return result;
}
export async function getCandidatosCorreo(
	c: CriteriosCandidatos,
	actorId: string,
	todos = false,
	signal?: AbortSignal,
) {
	const db = await createHumanRequestClient(actorId, signal);
	const { data, error } = await db
		.rpc('consultar_candidatos_correo', {
			p_page: c.page,
			p_page_size: c.pageSize,
			p_tipo: c.tipo,
			p_busqueda: c.busqueda.trim(),
			...(c.deporteId ? { p_deporte_id: c.deporteId } : {}),
			...(c.categoriaId ? { p_categoria_id: c.categoriaId } : {}),
			p_estado_pago: c.estadoPago,
			p_incluir_desuscriptos: c.tipo === 'deuda' && c.incluirDesuscriptos,
			p_todos: todos,
		})
		.abortSignal(signal ?? new AbortController().signal);
	if (error) {
		throw new Error(
			error.code === '22023'
				? 'La selección supera el límite o sus filtros no son válidos. Ajustá el filtro antes de seleccionar todos.'
				: 'No se pudo calcular la selección de destinatarios.',
		);
	}
	const result = parseCandidatos(data);
	if (result.page !== c.page || result.pageSize !== c.pageSize) {
		throw new Error('La selección recibida no coincide con el filtro.');
	}
	if (todos && (!result.idsFiltrados || result.idsFiltrados.length !== result.total)) {
		throw new Error('No se obtuvo la selección completa. No se enviará sólo una página.');
	}
	return result;
}

export async function getNotificacionCorreo(
	operation: { comprobanteId: string } | { jobId: string },
	actorId: string,
	signal?: AbortSignal,
): Promise<{
	estado: 'pendiente' | 'encolado' | 'advertencia' | 'sin_notificacion';
	advertencia: string | null;
}> {
	const values = Object.values(operation);
	if (values.length !== 1 || !UUID_CORREO.test(values[0] ?? '')) {
		throw new Error('La operación consultada no es válida.');
	}
	const db = await createHumanRequestClient(actorId, signal);
	const { data, error } = await db.functions.invoke(
		`comunicaciones/notificacion?${new URLSearchParams(operation)}`,
		{ method: 'GET', ...(signal ? { signal } : {}) },
	);
	if (error) {
		throw await errorComunicaciones(error);
	}
	if (
		!data ||
		!['pendiente', 'encolado', 'advertencia', 'sin_notificacion'].includes(data.estado) ||
		(data.advertencia !== null && typeof data.advertencia !== 'string')
	) {
		throw new Error('No se pudo confirmar el aviso de la operación.');
	}
	return { estado: data.estado, advertencia: data.advertencia };
}
