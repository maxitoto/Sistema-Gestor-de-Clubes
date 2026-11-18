export const UUID_CORREO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ETIQUETAS_CORREO = ['nombre', 'apellido', 'deporte', 'deuda'] as const;
export interface TextoPlantilla {
	nombre_interno: string;
	asunto: string;
	cuerpo: string;
}
export function validarTextoCorreo(asunto: string, cuerpo: string): string | null {
	if (!asunto.trim() || asunto.trim().length > 255 || /[\r\n]/.test(asunto)) {
		return 'El asunto debe tener entre 1 y 255 caracteres, sin saltos de línea.';
	}
	if (!cuerpo.trim() || cuerpo.trim().length > 10000) {
		return 'El mensaje debe tener entre 1 y 10.000 caracteres.';
	}
	if (/\{\{|\}\}/.test((asunto + cuerpo).replace(/\{\{(nombre|apellido|deporte|deuda)\}\}/g, ''))) {
		return 'Usá únicamente las etiquetas {{nombre}}, {{apellido}}, {{deporte}} y {{deuda}} completas.';
	}
	return null;
}
export function validarPlantilla(p: TextoPlantilla): string | null {
	if (!p.nombre_interno.trim() || p.nombre_interno.trim().length > 150) {
		return 'El nombre debe tener entre 1 y 150 caracteres.';
	}
	return validarTextoCorreo(p.asunto, p.cuerpo);
}
export function vistaPreviaCorreo(text: string, values: Record<string, string> = {}) {
	const defaults: Record<string, string> = {
		nombre: 'Persona sintética',
		apellido: 'De ejemplo',
		deporte: 'Actividad de ejemplo',
		deuda: '$ 1.000,00',
	};
	return text.replace(
		/\{\{(nombre|apellido|deporte|deuda)\}\}/g,
		(_, key: string) => values[key] ?? defaults[key] ?? '',
	);
}
export function idsCanonicosCorreo(ids: string[]): string[] {
	const result = [...new Set(ids.map((id) => id.toLowerCase()))].sort();
	if (result.length < 1 || result.length > 1000 || result.some((id) => !UUID_CORREO.test(id))) {
		throw new Error('Seleccioná entre 1 y 1000 socios válidos.');
	}
	return result;
}
export function rangoDiasCorreo(desde: string, hasta: string): { desde?: string; hasta?: string } {
	const date = (s: string) => {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
			throw new Error('Revisá las fechas del filtro.');
		}
		const d = new Date(`${s}T00:00:00-03:00`);
		if (
			Number.isNaN(d.getTime()) ||
			new Date(d.getTime() - 10800000).toISOString().slice(0, 10) !== s
		) {
			throw new Error('Revisá las fechas del filtro.');
		}
		return d;
	};
	if (desde && hasta && desde > hasta) {
		throw new Error('La fecha desde no puede superar la fecha hasta.');
	}
	const result: { desde?: string; hasta?: string } = {};
	if (desde) {
		result.desde = date(desde).toISOString();
	}
	if (hasta) {
		const d = date(hasta);
		d.setUTCDate(d.getUTCDate() + 1);
		result.hasta = d.toISOString();
	}
	return result;
}
const formatoFechaCorreo = new Intl.DateTimeFormat('es-AR', {
	dateStyle: 'short',
	timeStyle: 'short',
	timeZone: 'America/Argentina/Buenos_Aires',
});
export function fechaCorreo(value: string | null) {
	return value ? formatoFechaCorreo.format(new Date(value)) : 'Sin información';
}
export function etiquetaDespacho(estado: string): string {
	return (
		(
			{
				pendiente: 'Pendiente',
				procesando: 'Procesando',
				aceptado: 'Aceptado por proveedor',
				fallido: 'Fallido',
				excluido: 'Excluido',
				incierto: 'Aceptación incierta',
			} as Record<string, string>
		)[estado] ?? 'Sin información'
	);
}
export function etiquetaEntrega(estado: string): string {
	return (
		(
			{
				sin_confirmar: 'Sin entrega confirmada',
				demorada: 'Entrega demorada',
				entregada: 'Entregado confirmado',
				rebote_duro: 'Rebote permanente',
				fallida: 'Entrega fallida',
			} as Record<string, string>
		)[estado] ?? 'Sin información'
	);
}
