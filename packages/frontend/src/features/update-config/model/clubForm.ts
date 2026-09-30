// src/features/club/update-config/model/clubForm.ts
import type { ClubConfig, ClubUpdate } from '#shared/types';

export interface ClubForm {
	nombre: string;
	cuit: string;
	domicilio_fiscal: string;
	email_contacto: string;
	punto_venta: string;
	logo_url: string;
}

export function toClubForm(config: ClubConfig): ClubForm {
	return {
		nombre: config.nombre,
		cuit: config.cuit,
		domicilio_fiscal: config.domicilio_fiscal,
		email_contacto: config.email_contacto,
		punto_venta: String(config.punto_venta),
		logo_url: config.logo_url ?? '',
	};
}

export function toClubUpdate(form: ClubForm): ClubUpdate {
	const puntoVenta = Number(form.punto_venta);
	if (!Number.isInteger(puntoVenta) || puntoVenta < 1 || puntoVenta > 99999) {
		throw new Error('El punto de venta debe ser un entero entre 1 y 99999.');
	}
	if (
		[form.nombre, form.cuit, form.domicilio_fiscal, form.email_contacto].some(
			(value) => !value.trim(),
		)
	) {
		throw new Error('Complete los campos obligatorios.');
	}
	return {
		nombre: form.nombre.trim(),
		cuit: form.cuit.trim(),
		domicilio_fiscal: form.domicilio_fiscal.trim(),
		email_contacto: form.email_contacto.trim(),
		punto_venta: puntoVenta,
		logo_url: form.logo_url.trim() || null,
	};
}
