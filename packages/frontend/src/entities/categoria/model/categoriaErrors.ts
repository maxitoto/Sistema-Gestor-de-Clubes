export function describirErrorCategoria(error: unknown): string {
	const value = error as { code?: string; status?: number; message?: string } | null;
	if (value?.code === '23505') {
		return 'Ya existe ese nombre. Los nombres de categorías deben ser únicos dentro del deporte, incluso si están inactivas.';
	}
	if (value?.status === 403 || value?.code === '42501' || value?.status === 401) {
		return 'Necesitás una sesión de Administrador activo para esta operación.';
	}
	if (value?.message?.includes('inscriptos activos')) {
		return 'No se puede dar de baja esta categoría porque tiene inscripciones activas. Desvinculá a esos socios antes de continuar.';
	}
	if (value?.message?.includes('ya esta inactiv')) {
		return 'Este registro ya está inactivo. Actualizá el catálogo para consultar su estado.';
	}
	return 'El servidor rechazó la operación. Revisá el nombre, los valores y las dependencias del registro.';
}
