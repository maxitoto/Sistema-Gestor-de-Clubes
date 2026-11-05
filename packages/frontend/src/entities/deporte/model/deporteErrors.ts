export function describirErrorDeporte(error: unknown): string {
	const value = error as { code?: string; status?: number; message?: string } | null;
	if (value?.code === '23505') {
		return 'Ya existe un deporte con ese nombre, incluso si está inactivo.';
	}
	if (value?.status === 403 || value?.code === '42501' || value?.status === 401) {
		return 'Necesitás una sesión de Administrador activo para esta operación.';
	}
	if (value?.message?.includes('categorias activas')) {
		return 'No se puede dar de baja este deporte porque tiene categorías activas. Revisá primero esas categorías.';
	}
	if (value?.message?.includes('ya esta inactiv')) {
		return 'Este registro ya está inactivo. Actualizá el catálogo para consultar su estado.';
	}
	return 'El servidor rechazó la operación. Revisá el nombre, los valores y las dependencias del registro.';
}
