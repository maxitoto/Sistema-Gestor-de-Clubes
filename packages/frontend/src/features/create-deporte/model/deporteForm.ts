import type { CrearDeportePayload } from '#entities/deporte';
export interface DeporteForm {
	nombre: string;
	descripcion: string;
}
export type DeporteFormErrors = Partial<Record<keyof DeporteForm, string>>;
export function validarDeporteForm(
	form: DeporteForm,
): { valid: true; payload: CrearDeportePayload } | { valid: false; errors: DeporteFormErrors } {
	const nombre = form.nombre.trim();
	if (!nombre || nombre.length > 100) {
		return { valid: false, errors: { nombre: 'Ingresá un nombre de hasta 100 caracteres.' } };
	}
	return { valid: true, payload: { nombre, descripcion: form.descripcion.trim() || null } };
}
