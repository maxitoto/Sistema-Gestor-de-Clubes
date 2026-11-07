import type { Gasto } from '../api/gastos.api';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function parseGasto(value: unknown): Gasto {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('No se pudo interpretar el gasto.');
	}
	const row = value as Gasto;
	if (
		!uuid.test(row.id) ||
		!uuid.test(row.categoria_id) ||
		!uuid.test(row.usuario_id) ||
		typeof row.concepto !== 'string' ||
		typeof row.fecha !== 'string' ||
		typeof row.created_at !== 'string' ||
		typeof row.updated_at !== 'string' ||
		!Number.isFinite(row.monto) ||
		row.monto <= 0 ||
		!['efectivo', 'transferencia'].includes(row.metodo_pago) ||
		!['activo', 'anulado'].includes(row.estado)
	) {
		throw new Error('No se pudo verificar el gasto consultado.');
	}
	for (const key of [
		'referencia_banco',
		'descripcion',
		'motivo_anulacion',
		'anulado_at',
		'anulado_por',
	] as const) {
		if (row[key] !== null && typeof row[key] !== 'string') {
			throw new Error('El detalle del gasto está incompleto.');
		}
	}
	if (
		row.categoria !== null &&
		(!row.categoria ||
			typeof row.categoria.nombre !== 'string' ||
			!uuid.test(row.categoria.id) ||
			!['activo', 'inactivo'].includes(row.categoria.estado))
	) {
		throw new Error('No se pudo interpretar la categoría del gasto.');
	}
	return row;
}
