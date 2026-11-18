import type { ActualizarSocioPayload, CrearSocioPayload, SocioDetalle } from '../api/socios.api';

export interface SocioForm {
	dni: string;
	nombre: string;
	apellido: string;
	fecha_nacimiento: string;
	email: string;
	telefono: string;
	direccion: string;
	acepta_comunicaciones: boolean;
	contacto_emergencia_nombre: string;
	contacto_emergencia_telefono: string;
}
export type SocioFormErrors = Partial<Record<keyof SocioForm, string>>;
export function formularioSocioInicial(): SocioForm {
	return {
		dni: '',
		nombre: '',
		apellido: '',
		fecha_nacimiento: '',
		email: '',
		telefono: '',
		direccion: '',
		acepta_comunicaciones: true,
		contacto_emergencia_nombre: '',
		contacto_emergencia_telefono: '',
	};
}

export function fechaBuenosAires(now = new Date()): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'America/Argentina/Buenos_Aires',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(now);
	const part = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((value) => value.type === type)?.value ?? '';
	return `${part('year')}-${part('month')}-${part('day')}`;
}

export function fechaCalendarioValida(value: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) {
		return false;
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
	const maximum = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
	return year >= 1 && maximum !== undefined && day >= 1 && day <= maximum;
}

export function edadSocio(fechaNacimiento: string, hoy = fechaBuenosAires()): number | null {
	if (
		!fechaCalendarioValida(fechaNacimiento) ||
		!fechaCalendarioValida(hoy) ||
		fechaNacimiento > hoy
	) {
		return null;
	}
	return (
		Number(hoy.slice(0, 4)) -
		Number(fechaNacimiento.slice(0, 4)) -
		(hoy.slice(5) < fechaNacimiento.slice(5) ? 1 : 0)
	);
}

export function validarSocioForm(
	form: SocioForm,
	now = new Date(),
): { valid: true; payload: CrearSocioPayload } | { valid: false; errors: SocioFormErrors } {
	const errors: SocioFormErrors = {};
	const dni = form.dni.trim();
	const nombre = form.nombre.trim();
	const apellido = form.apellido.trim();
	const nacimiento = form.fecha_nacimiento.trim();
	const email = form.email.trim();
	const telefono = form.telefono.trim();
	const emergenciaNombre = form.contacto_emergencia_nombre.trim();
	const emergenciaTelefono = form.contacto_emergencia_telefono.trim();
	for (const [key, value, maximum] of [
		['dni', dni, 20],
		['nombre', nombre, 100],
		['apellido', apellido, 100],
	] as const) {
		if (!value) {
			errors[key] = 'Este campo es obligatorio.';
		} else if (value.length > maximum) {
			errors[key] = `Usá hasta ${maximum} caracteres.`;
		}
	}
	const hoy = fechaBuenosAires(now);
	if (!fechaCalendarioValida(nacimiento)) {
		errors.fecha_nacimiento = 'Ingresá una fecha de calendario válida (AAAA-MM-DD).';
	} else if (nacimiento > hoy) {
		errors.fecha_nacimiento = 'La fecha de nacimiento no puede ser futura.';
	}
	if (email.length > 255 || (email && !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email))) {
		errors.email = 'Ingresá un email válido de hasta 255 caracteres o dejalo vacío.';
	}
	if (telefono.length > 50) {
		errors.telefono = 'Usá hasta 50 caracteres.';
	}
	if (emergenciaNombre.length > 150) {
		errors.contacto_emergencia_nombre = 'Usá hasta 150 caracteres.';
	}
	if (emergenciaTelefono.length > 50) {
		errors.contacto_emergencia_telefono = 'Usá hasta 50 caracteres.';
	}
	const edad = edadSocio(nacimiento, hoy);
	if (edad !== null && edad < 18) {
		if (!emergenciaNombre) {
			errors.contacto_emergencia_nombre = 'El menor necesita un nombre de contacto de emergencia.';
		}
		if (!emergenciaTelefono) {
			errors.contacto_emergencia_telefono =
				'El menor necesita un teléfono de contacto de emergencia.';
		}
	}
	if (typeof form.acepta_comunicaciones !== 'boolean') {
		errors.acepta_comunicaciones = 'Indicá si acepta comunicaciones.';
	}
	if (Object.keys(errors).length) {
		return { valid: false, errors };
	}
	return {
		valid: true,
		payload: {
			dni,
			nombre,
			apellido,
			fecha_nacimiento: nacimiento,
			email: email || null,
			telefono: telefono || null,
			direccion: form.direccion.trim() || null,
			acepta_comunicaciones: form.acepta_comunicaciones,
			contacto_emergencia_nombre: emergenciaNombre || null,
			contacto_emergencia_telefono: emergenciaTelefono || null,
		},
	};
}

export function formularioDesdeSocio(socio: SocioDetalle): SocioForm {
	return {
		dni: socio.dni,
		nombre: socio.nombre,
		apellido: socio.apellido,
		fecha_nacimiento: socio.fecha_nacimiento,
		email: socio.email ?? '',
		telefono: socio.telefono ?? '',
		direccion: socio.direccion ?? '',
		acepta_comunicaciones: socio.acepta_comunicaciones,
		contacto_emergencia_nombre: socio.contacto_emergencia_nombre ?? '',
		contacto_emergencia_telefono: socio.contacto_emergencia_telefono ?? '',
	};
}
export function payloadEdicionSocio(
	payload: CrearSocioPayload,
	corregirDni: boolean,
): ActualizarSocioPayload {
	return {
		nombre: payload.nombre,
		apellido: payload.apellido,
		fecha_nacimiento: payload.fecha_nacimiento,
		email: payload.email,
		telefono: payload.telefono,
		direccion: payload.direccion,
		acepta_comunicaciones: payload.acepta_comunicaciones,
		contacto_emergencia_nombre: payload.contacto_emergencia_nombre,
		contacto_emergencia_telefono: payload.contacto_emergencia_telefono,
		...(corregirDni ? { dni: payload.dni } : {}),
	};
}
export function coincideEdicionSocio(row: SocioDetalle, payload: ActualizarSocioPayload): boolean {
	return Object.entries(payload).every(([key, value]) => row[key as keyof SocioDetalle] === value);
}
