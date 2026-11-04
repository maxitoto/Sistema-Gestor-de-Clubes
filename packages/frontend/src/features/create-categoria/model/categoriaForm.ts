import type { CrearCategoriaPayload } from '#entities/categoria';
export interface CategoriaForm {
	deporte_id: string;
	nombre: string;
	arancel_mensual: string;
	edad_min: string;
	edad_max: string;
}
export type CategoriaFormErrors = Partial<Record<keyof CategoriaForm, string>>;
export function validarCategoriaForm(
	form: CategoriaForm,
): { valid: true; payload: CrearCategoriaPayload } | { valid: false; errors: CategoriaFormErrors } {
	const errors: CategoriaFormErrors = {};
	const nombre = form.nombre.trim();
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(form.deporte_id)) {
		errors.deporte_id = 'Seleccioná un deporte.';
	}
	if (!nombre || nombre.length > 100) {
		errors.nombre = 'Ingresá un nombre de hasta 100 caracteres.';
	}
	// Validar centavos como texto, sin redondeo financiero ni cálculos del arancel.
	const amount = form.arancel_mensual.trim();
	if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(amount) || !/[1-9]/.test(amount)) {
		errors.arancel_mensual =
			'Ingresá un arancel mayor que cero, hasta 99999999.99 y con hasta dos decimales (punto).';
	}
	const min = form.edad_min.trim();
	const max = form.edad_max.trim();
	const bothEmpty = min === '' && max === '';
	const integer = (value: string) => /^\d+$/.test(value) && Number(value) <= 2147483647;
	if (!bothEmpty && (!integer(min) || !integer(max) || Number(min) > Number(max))) {
		errors.edad_min = 'Dejá ambas edades vacías o usá enteros: 0 ≤ mínima ≤ máxima.';
		errors.edad_max = errors.edad_min;
	}
	if (Object.keys(errors).length) {
		return { valid: false, errors };
	}
	return {
		valid: true,
		payload: {
			deporte_id: form.deporte_id,
			nombre,
			arancel_mensual: Number(amount),
			edad_min: bothEmpty ? null : Number(min),
			edad_max: bothEmpty ? null : Number(max),
		},
	};
}
