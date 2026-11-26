import type { ClubConfig, ClubUpdate } from '#shared/types';

export interface ClubForm {
	nombre: string;
	cuit: string;
	domicilio_fiscal: string;
	email_contacto: string;
	punto_venta: string;
}

export type ClubFormErrors = Partial<Record<keyof ClubForm, string>>;

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

export function validarClubForm(
	form: ClubForm,
): { valid: true; payload: ClubUpdate } | { valid: false; errors: ClubFormErrors } {
	const errors: ClubFormErrors = {};
	const nombre = form.nombre.trim();
	const cuit = form.cuit.trim();
	const domicilio = form.domicilio_fiscal.trim();
	const email = form.email_contacto.trim();
	const pv = form.punto_venta.trim();

	if (!nombre) {
		errors.nombre = 'Ingresá el nombre o razón social del club.';
	} else if (nombre.length > 255) {
		errors.nombre = 'Usá hasta 255 caracteres.';
	}

	if (!cuit) {
		errors.cuit = 'Ingresá el CUIT del club.';
	} else if (!cuitValido(cuit)) {
		errors.cuit = 'Usá formato XX-XXXXXXXX-X con dígito verificador válido.';
	}

	if (!domicilio) {
		errors.domicilio_fiscal = 'Ingresá el domicilio fiscal.';
	} else if (domicilio.length > 2000) {
		errors.domicilio_fiscal = 'Usá hasta 2000 caracteres.';
	}

	if (!email) {
		errors.email_contacto = 'Ingresá un correo de contacto.';
	} else if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		errors.email_contacto = 'Ingresá un correo electrónico válido.';
	}

	if (!/^\d{1,5}$/.test(pv) || Number(pv) < 1) {
		errors.punto_venta = 'Ingresá un entero entre 1 y 99999.';
	}

	if (Object.keys(errors).length) {
		return { valid: false, errors };
	}

	return {
		valid: true,
		payload: {
			nombre,
			cuit,
			domicilio_fiscal: domicilio,
			email_contacto: email,
			punto_venta: Number(pv),
		},
	};
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
		throw new Error('Completá todos los campos obligatorios.');
	}
	if (
		form.nombre.trim().length > 255 ||
		form.email_contacto.trim().length > 255 ||
		form.domicilio_fiscal.trim().length > 2000
	) {
		throw new Error('Revisá la longitud de los datos institucionales.');
	}
	if (!cuitValido(form.cuit.trim())) {
		throw new Error('El CUIT debe tener formato XX-XXXXXXXX-X y dígito verificador válido.');
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email_contacto.trim())) {
		throw new Error('Ingresá un correo de contacto válido.');
	}
	return {
		nombre: form.nombre.trim(),
		cuit: form.cuit.trim(),
		domicilio_fiscal: form.domicilio_fiscal.trim(),
		email_contacto: form.email_contacto.trim(),
		punto_venta: Number(form.punto_venta),
	};
}
