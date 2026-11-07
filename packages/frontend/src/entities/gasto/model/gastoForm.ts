import type { DatosGasto, Gasto } from '../api/gastos.api';
export interface GastoForm {
	categoria_id: string;
	fecha: string;
	concepto: string;
	monto: string;
	metodo_pago: 'efectivo' | 'transferencia';
	referencia_banco: string;
	descripcion: string;
}
export const formGastoVacio = (fecha = ''): GastoForm => ({
	categoria_id: '',
	fecha,
	concepto: '',
	monto: '',
	metodo_pago: 'efectivo',
	referencia_banco: '',
	descripcion: '',
});
export const formDesdeGasto = (g: Gasto): GastoForm => ({
	categoria_id: g.categoria_id,
	fecha: g.fecha,
	concepto: g.concepto,
	monto: String(g.monto),
	metodo_pago: g.metodo_pago,
	referencia_banco: g.referencia_banco ?? '',
	descripcion: g.descripcion ?? '',
});
export function fechaCalendario(value: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return false;
	}
	const date = new Date(`${value}T12:00:00Z`);
	return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validarGasto(form: GastoForm): {
	datos: DatosGasto | null;
	errores: Partial<Record<keyof GastoForm, string>>;
} {
	const errores: Partial<Record<keyof GastoForm, string>> = {};
	const text = form.monto.trim().replace(',', '.');
	const monto = Number(text);
	if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(form.categoria_id)) {
		errores.categoria_id = 'Elegí una categoría activa.';
	}
	if (!fechaCalendario(form.fecha)) {
		errores.fecha = 'Ingresá una fecha válida.';
	}
	if (!form.concepto.trim() || form.concepto.trim().length > 255) {
		errores.concepto = 'Completá un concepto de hasta 255 caracteres.';
	}
	if (!/^\d+(?:\.\d{1,2})?$/.test(text) || monto <= 0 || monto > 99999999.99) {
		errores.monto = 'Ingresá un importe mayor que cero, con hasta dos decimales.';
	}
	if (!['efectivo', 'transferencia'].includes(form.metodo_pago)) {
		errores.metodo_pago = 'Elegí un medio de pago.';
	}
	if (
		form.referencia_banco.trim().length > 255 ||
		(form.metodo_pago === 'transferencia' && !form.referencia_banco.trim())
	) {
		errores.referencia_banco = 'Completá la referencia o banco de la transferencia.';
	}
	const datos: DatosGasto = {
		categoria_id: form.categoria_id,
		fecha: form.fecha,
		concepto: form.concepto.trim(),
		monto,
		metodo_pago: form.metodo_pago,
		referencia_banco: form.referencia_banco.trim() || null,
		descripcion: form.descripcion.trim() || null,
	};
	return { datos: Object.keys(errores).length ? null : datos, errores };
}
export function coincideGasto(gasto: Gasto, datos: DatosGasto) {
	return Object.entries(datos).every(([key, value]) => gasto[key as keyof DatosGasto] === value);
}
export function fechaCargaClub(gasto: Gasto) {
	const date = new Date(gasto.created_at);
	if (!Number.isFinite(date.getTime())) {
		return '';
	}
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'America/Argentina/Buenos_Aires',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(date);
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
	return `${get('year')}-${get('month')}-${get('day')}`;
}
export const puedeEditarGasto = (g: Gasto, hoy: string) =>
	g.estado === 'activo' && fechaCalendario(hoy) && fechaCargaClub(g) === hoy;
export const puedeAnularGasto = (g: Gasto, hoy: string, rol: string) =>
	g.estado === 'activo' && (rol === 'admin' || puedeEditarGasto(g, hoy));
export function errorGasto(error: unknown) {
	const e = error as { message?: string; code?: string; status?: number };
	if (e.status === 401 || e.status === 403 || ['42501', '28000'].includes(e.code ?? '')) {
		return 'No tenés permisos para esta operación o terminó el día de carga. Actualizá el detalle.';
	}
	if (e.code === '23505') {
		return 'Este intento ya tiene otros datos. Consultá su resultado antes de continuar.';
	}
	if (['23514', '23502', '22023', '22007', '22008', '22001', '22003'].includes(e.code ?? '')) {
		return 'Revisá categoría, fecha, concepto, importe y referencia del gasto.';
	}
	if (e.code === 'P0001') {
		if (e.message?.includes('anulado')) {
			return 'El gasto ya fue anulado. Actualizá el detalle para consultar quién lo anuló y su motivo.';
		}
		if (e.message?.includes('dias anteriores')) {
			return 'La ventana de edición terminó. Un Administrador puede anularlo y registrar otro gasto.';
		}
		if (e.message?.includes('motivo')) {
			return 'Completá el motivo de anulación.';
		}
		return 'El gasto ya no admite esta operación. Actualizá el detalle.';
	}
	return 'No se pudo confirmar la operación. Consultá el resultado antes de repetir.';
}
export function coincideAnulacionGasto(gasto: Gasto, motivo: string, actorId: string) {
	return (
		gasto.estado === 'anulado' &&
		gasto.motivo_anulacion === motivo.trim() &&
		gasto.anulado_por === actorId
	);
}
export function mensajeAltaGasto(evidenciaPrevista: boolean, archivoDisponible: boolean) {
	return evidenciaPrevista
		? archivoDisponible
			? 'Gasto registrado; evidencia pendiente de guardar.'
			: 'Gasto registrado; evidencia pendiente. Volvé a elegir el archivo en el detalle, sin registrar otro gasto.'
		: 'Gasto registrado.';
}
export const monedaGasto = (value: number) =>
	new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);
