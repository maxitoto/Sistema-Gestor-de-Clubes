import type { CategoriaGastoPayload } from '../api/categoriasGasto.api';
export interface CategoriaGastoForm {
	nombre: string;
	descripcion: string;
}
export function validarCategoriaGasto(
	form: CategoriaGastoForm,
): { valid: true; payload: CategoriaGastoPayload } | { valid: false; error: string } {
	const nombre = form.nombre.trim();
	if (
		!nombre ||
		nombre.length > 100 ||
		[...nombre].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
	) {
		return { valid: false, error: 'Ingresá un nombre de hasta 100 caracteres.' };
	}
	return { valid: true, payload: { nombre, descripcion: form.descripcion.trim() || null } };
}
export function describirErrorCategoriaGasto(error: unknown) {
	const e = error as { code?: string; status?: number } | null;
	if (e?.code === '23505') {
		return 'Ya existe una categoría con ese nombre, incluso si está inactiva.';
	}
	if (e?.code === '42501' || e?.status === 401 || e?.status === 403) {
		return 'Necesitás una sesión de Administrador activo para gestionar categorías.';
	}
	return 'No se pudo guardar la categoría. Revisá el nombre y volvé a consultar.';
}
