import { describe, expect, test } from 'bun:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import type { EstadoFiscalComprobante } from '../src/entities/comprobante/model/fiscalContract';
import {
	motivoBloqueoAnulacionPago,
	parseEstadoAnulacionPago,
} from '../src/entities/pago/model/anulacionPago';
import {
	actualizarLecturasCobroFiscal,
	observarEstadoFiscalDelCobro,
} from '../src/pages/pagos/model/sincronizacionFiscalPago';

const pagoId = '50000000-0000-0000-0000-000000000001';
const documentoId = '50000000-0000-0000-0000-000000000002';
const scope = 'sesion-sintetica';
const fiscalKey = ['comprobante-fiscal', scope, documentoId];
async function esperar(predicate: () => boolean) {
	for (let i = 0; i < 100; i++) {
		if (predicate()) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 2));
	}
	throw new Error('La lectura de caché no se sincronizó.');
}
function escenario() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
	});
	const source = {
		autorizado: false,
		fallaPermiso: false,
		lecturasDetalle: 0,
		lecturasPermiso: 0,
		ajenas: 0,
	};
	const fiscal = (): EstadoFiscalComprobante => ({
		comprobanteId: documentoId,
		pagoId,
		cobroConfirmado: true,
		estadoFiscal: source.autorizado ? 'valido' : 'pendiente_cae',
		numero: source.autorizado ? '9' : null,
		cae: source.autorizado ? '90000000000009' : null,
		vencimiento: source.autorizado ? '2026-11-07' : null,
		operacion: source.autorizado ? 'autorizado' : null,
		emisionDisponible: !source.autorizado,
		aviso: null,
		pdfVersion: source.autorizado ? 'autorizado' : 'provisional',
	});
	const detalle = new QueryObserver(client, {
		queryKey: ['pagos', scope, 'detalle', pagoId],
		queryFn: async () => {
			source.lecturasDetalle++;
			return { estado_fiscal: fiscal().estadoFiscal };
		},
	});
	const permiso = new QueryObserver(client, {
		queryKey: ['anulacion-cobro', scope, pagoId],
		queryFn: async () => {
			source.lecturasPermiso++;
			if (source.fallaPermiso) {
				throw new Error('Permiso no consultable');
			}
			const actual = fiscal();
			return parseEstadoAnulacionPago(
				{
					id: pagoId,
					estado: 'completado',
					fecha_pago: '2026-10-28T13:00:00Z',
					motivo_anulacion: null,
					anulado_por: null,
					anulado_at: null,
				},
				{ estado_fiscal: actual.estadoFiscal, cae: actual.cae },
				'2026-10-28',
				pagoId,
			);
		},
	});
	const ajenas = [
		new QueryObserver(client, {
			queryKey: ['anulacion-cobro', 'otra-sesion', pagoId],
			queryFn: async () => {
				source.ajenas++;
				return 'intacto';
			},
		}),
		new QueryObserver(client, {
			queryKey: ['pagos', scope, 'detalle', 'otro-pago'],
			queryFn: async () => {
				source.ajenas++;
				return 'intacto';
			},
		}),
	];
	const unsubs = [
		detalle.subscribe(() => {}),
		permiso.subscribe(() => {}),
		...ajenas.map((observer) => observer.subscribe(() => {})),
	];
	return {
		client,
		source,
		fiscal,
		detalle,
		permiso,
		permisoActual() {
			const row = permiso.getCurrentResult().data;
			if (!row) {
				throw new Error('Sin lectura de permiso');
			}
			return row;
		},
		async cargar() {
			await Promise.all([
				detalle.refetch(),
				permiso.refetch(),
				...ajenas.map((observer) => observer.refetch()),
			]);
		},
		cerrar() {
			for (const unsubscribe of unsubs) {
				unsubscribe();
			}
			client.clear();
		},
	};
}

describe('detalle y permiso después de autorización fiscal', () => {
	test('transición de polling refresca ambos, sin tocar otro pago/sesión ni crear bucles', async () => {
		const s = escenario();
		let stop = () => {};
		try {
			await s.cargar();
			expect(motivoBloqueoAnulacionPago(s.permisoActual(), 'admin')).not.toBeNull();
			s.client.setQueryData(fiscalKey, s.fiscal());
			stop = observarEstadoFiscalDelCobro(s.client, scope, pagoId, documentoId);
			await esperar(
				() => !s.detalle.getCurrentResult().isFetching && !s.permiso.getCurrentResult().isFetching,
			);
			const antes = {
				detalle: s.source.lecturasDetalle,
				permiso: s.source.lecturasPermiso,
				ajenas: s.source.ajenas,
			};
			s.source.autorizado = true;
			s.client.setQueryData(fiscalKey, s.fiscal());
			await esperar(() => s.permiso.getCurrentResult().data?.estadoFiscal === 'valido');
			expect(s.detalle.getCurrentResult().data?.estado_fiscal).toBe('valido');
			expect(motivoBloqueoAnulacionPago(s.permisoActual(), 'admin')).toBeNull();
			expect(s.source.lecturasDetalle).toBe(antes.detalle + 1);
			expect(s.source.lecturasPermiso).toBe(antes.permiso + 1);
			expect(s.source.ajenas).toBe(antes.ajenas);
			s.client.setQueryData(fiscalKey, { ...s.fiscal(), aviso: 'Sólo cambia el mensaje' });
			await new Promise((resolve) => setTimeout(resolve, 5));
			expect(s.source.lecturasPermiso).toBe(antes.permiso + 1);
			stop();
			s.client.setQueryData(fiscalKey, { ...s.fiscal(), operacion: 'incidencia' });
			await new Promise((resolve) => setTimeout(resolve, 5));
			expect(s.source.lecturasPermiso).toBe(antes.permiso + 1);
		} finally {
			stop();
			s.cerrar();
		}
	});
	test('Consultar estado refresca permiso aunque la firma fiscal visible no cambie', async () => {
		const s = escenario();
		try {
			await s.cargar();
			s.source.autorizado = true;
			await actualizarLecturasCobroFiscal(s.client, scope, pagoId);
			expect(s.detalle.getCurrentResult().data?.estado_fiscal).toBe('valido');
			expect(motivoBloqueoAnulacionPago(s.permisoActual(), 'admin')).toBeNull();
		} finally {
			s.cerrar();
		}
	});
	test('error de lectura de permiso se conserva como error, no habilita anulación por el encabezado', async () => {
		const s = escenario();
		let stop = () => {};
		try {
			await s.cargar();
			stop = observarEstadoFiscalDelCobro(s.client, scope, pagoId, documentoId);
			s.source.autorizado = true;
			s.source.fallaPermiso = true;
			s.client.setQueryData(fiscalKey, s.fiscal());
			await esperar(() => s.permiso.getCurrentResult().isError);
			expect(s.detalle.getCurrentResult().data?.estado_fiscal).toBe('valido');
			expect(s.permiso.getCurrentResult().isError).toBe(true);
			expect(s.permiso.getCurrentResult().data?.estadoFiscal).toBe('pendiente_cae');
		} finally {
			stop();
			s.cerrar();
		}
	});
});
