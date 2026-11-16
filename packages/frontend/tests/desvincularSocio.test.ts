import { describe, expect, test } from 'bun:test';
import { validarSolicitudCobro } from '../src/features/cobrar-cuota/model/cobroContract';
import { describirDeudaDesvinculacion } from '../src/features/desvincular-socio/model/deudaDesvinculacion';

const CUOTA_ID = 'd8de8561-22a0-42ab-a03b-ab7a9a3f1027';

describe('advertencia de deuda al desvincular actividad', () => {
	test('informa monto y cantidad de cuotas pendientes en la disciplina', () => {
		const aviso = describirDeudaDesvinculacion({
			isPending: false,
			isError: false,
			data: { total: 2, deuda_filtrada: '24000.00' },
		});
		expect(aviso.estado).toBe('con_deuda');
		if (aviso.estado === 'con_deuda') {
			expect(aviso.cuotas).toBe(2);
			expect(aviso.monto).toContain('24.000,00');
			expect(aviso.mensaje).toContain('El socio adeuda');
			expect(aviso.mensaje).toContain('2 cuotas pendientes');
		}
	});

	test('omite la alerta de deuda cuando el saldo filtrado es cero', () => {
		expect(
			describirDeudaDesvinculacion({
				isPending: false,
				isError: false,
				data: { total: 0, deuda_filtrada: '0.00' },
			}),
		).toEqual({ estado: 'sin_deuda' });
	});

	test('degrada a aviso informativo ante error o carga pendiente sin bloquear la baja', () => {
		expect(describirDeudaDesvinculacion({ isPending: true, isError: false })).toEqual({
			estado: 'cargando',
		});
		expect(describirDeudaDesvinculacion({ isPending: false, isError: true }).estado).toBe('error');
	});

	test('valida longitud máxima de referencia con formato correcto en cobro', () => {
		expect(() => validarSolicitudCobro(CUOTA_ID, 'transferencia', 'a'.repeat(256), true)).toThrow(
			'La referencia admite hasta 255 caracteres.',
		);
	});
});
