import type { DatosUsuario } from '../api/usuarios.api';
export function validarUsuario(input: DatosUsuario): {
	datos: DatosUsuario;
	errores: Partial<Record<keyof DatosUsuario, string>>;
} {
	const datos = {
		nombre: input.nombre.trim(),
		apellido: input.apellido.trim(),
		email: input.email.trim().toLowerCase(),
		rol: input.rol,
	};
	const errores: Partial<Record<keyof DatosUsuario, string>> = {};
	for (const field of ['nombre', 'apellido'] as const) {
		if (!datos[field] || datos[field].length > 100) {
			errores[field] = 'Completá este campo con hasta 100 caracteres.';
		}
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email) || datos.email.length > 254) {
		errores.email = 'Ingresá un correo válido.';
	}
	if (datos.rol !== 'admin' && datos.rol !== 'responsable') {
		errores.rol = 'Elegí un rol válido.';
	}
	return { datos, errores };
}
