import { createHumanRequestClient } from '#shared/api/humanRequest';
import { type TextoPlantilla, UUID_CORREO, validarPlantilla } from '#shared/lib/comunicaciones';
export interface PlantillaCorreo extends TextoPlantilla {
	id: string;
	estado: 'activo' | 'inactivo';
}
const columns = 'id,nombre_interno,asunto,cuerpo,estado';
export async function getPlantillasCorreo(
	page: number,
	pageSize: number,
	estado: string,
	actorId: string,
	signal?: AbortSignal,
) {
	const db = await createHumanRequestClient(actorId, signal);
	let query = db
		.from('plantillas_correo')
		.select(columns, { count: 'exact' })
		.order('nombre_interno')
		.order('id');
	if (estado !== 'todos') {
		query = query.eq('estado', estado as 'activo' | 'inactivo');
	}
	const { data, error, count } = await query
		.range((page - 1) * pageSize, page * pageSize - 1)
		.abortSignal(signal ?? new AbortController().signal);
	if (error || !data || count === null) {
		throw new Error('No se pudo consultar las plantillas.');
	}
	return { plantillas: data as PlantillaCorreo[], total: count };
}
export async function guardarPlantillaCorreo(
	input: TextoPlantilla,
	id: string | null,
	actorId: string,
	signal?: AbortSignal,
): Promise<PlantillaCorreo> {
	const issue = validarPlantilla(input);
	if (issue) {
		throw new Error(issue);
	}
	const payload = {
		nombre_interno: input.nombre_interno.trim(),
		asunto: input.asunto.trim(),
		cuerpo: input.cuerpo.trim(),
	};
	const db = await createHumanRequestClient(actorId, signal);
	if (id && !UUID_CORREO.test(id)) {
		throw new Error('La plantilla cambió. Consultá la lista.');
	}
	const query = id
		? db.from('plantillas_correo').update(payload).eq('id', id)
		: db.from('plantillas_correo').insert({ ...payload, estado: 'activo' });
	const { data, error } = await query
		.select(columns)
		.abortSignal(signal ?? new AbortController().signal)
		.single();
	if (error || !data) {
		throw new Error(
			error?.code === '23505'
				? 'Ya existe una plantilla con ese nombre.'
				: 'No se confirmó el guardado. Consultá la lista antes de repetir.',
		);
	}
	return data as PlantillaCorreo;
}
export async function cambiarEstadoPlantilla(
	id: string,
	estado: 'activo' | 'inactivo',
	actorId: string,
	signal?: AbortSignal,
) {
	if (!UUID_CORREO.test(id)) {
		throw new Error('La plantilla no es válida.');
	}
	const db = await createHumanRequestClient(actorId, signal);
	const { data, error } = await db
		.from('plantillas_correo')
		.update({ estado })
		.eq('id', id)
		.select('id,estado')
		.abortSignal(signal ?? new AbortController().signal)
		.single();
	if (error || !data || data.estado !== estado) {
		throw new Error('No se confirmó el cambio. Consultá la lista.');
	}
}
