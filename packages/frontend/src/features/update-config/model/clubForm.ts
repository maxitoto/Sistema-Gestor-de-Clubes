import type { ClubConfig, ClubUpdate } from '#shared/types';

export interface ClubForm {
	nombre: string;
	cuit: string;
	domicilio_fiscal: string;
	email_contacto: string;
	punto_venta: string;
}
export function toClubForm(config: ClubConfig): ClubForm {
	return {
		nombre: config.nombre,
		cuit: config.cuit,
		domicilio_fiscal: config.domicilio_fiscal,
		email_contacto: config.email_contacto,
		punto_venta: String(config.punto_venta),
	};
}
export function cuitValido(value: string): boolean {
	if (!/^\d{2}-\d{8}-\d$/.test(value)) {
		return false;
	}
	const digits = value.replaceAll('-', '').split('').map(Number);
	const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
	const sum = weights.reduce((acc, weight, index) => acc + weight * (digits[index] ?? 0), 0);
	const remainder = 11 - (sum % 11);
	const check = remainder % 11;
	return digits[10] === check;
}
export function toClubUpdate(form: ClubForm): ClubUpdate {
	if (!/^\d{1,5}$/.test(form.punto_venta) || Number(form.punto_venta) < 1) {
		throw new Error('El punto de venta debe ser un entero entre 1 y 99999.');
	}
	if (
		[form.nombre, form.cuit, form.domicilio_fiscal, form.email_contacto].some(
			(value) => !value.trim(),
		)
	) {
		throw new Error('Complete los campos obligatorios.');
	}
	if (
		form.nombre.trim().length > 255 ||
		form.email_contacto.trim().length > 255 ||
		form.domicilio_fiscal.trim().length > 2000
	) {
		throw new Error('Revise la longitud de los datos institucionales.');
	}
	if (!cuitValido(form.cuit.trim())) {
		throw new Error('El CUIT debe tener formato XX-XXXXXXXX-X y dígito verificador válido.');
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email_contacto.trim())) {
		throw new Error('Ingrese un email de contacto válido.');
	}
	return {
		nombre: form.nombre.trim(),
		cuit: form.cuit.trim(),
		domicilio_fiscal: form.domicilio_fiscal.trim(),
		email_contacto: form.email_contacto.trim(),
		punto_venta: Number(form.punto_venta),
	};
}
