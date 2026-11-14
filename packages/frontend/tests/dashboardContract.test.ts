import { describe, expect, test } from 'bun:test';
import {
	diasPeriodoDashboard,
	enlacesDashboard,
	interpretarDashboard,
	periodoDashboardActual,
} from '../src/entities/dashboard/model/dashboardContract';

const selected = { mes: 1, anio: 2026 };
const id = '00000000-0000-0000-0000-000000000001';
function payload() {
	return {
		version: 1,
		zona: 'America/Argentina/Buenos_Aires',
		consultadoEn: '2026-10-26T21:00:00+00:00',
		periodo: {
			mes: 1,
			anio: 2026,
			desde: '2026-01-01T03:00:00+00:00',
			hasta: '2026-02-01T03:00:00+00:00',
		},
		actuales: { sociosActivos: 1, sociosMorosos: 2, deudaTotal: '300.00', emailsInvalidos: 0 },
		finanzas: {
			ingresosOriginales: '100.00',
			egresosOriginales: '25.00',
			neto: '-50.00',
			movimientos: 4,
		},
		meses: [8, 9, 10, 11, 12, 1].map((mes, i) => ({
			mes,
			anio: i === 5 ? 2026 : 2025,
			ingresosOriginales: '100.00',
			egresosOriginales: '25.00',
			neto: '-50.00',
		})),
		morosidadPorDeporte: [
			{ deporteId: id, deporte: 'Deporte histórico', cuotasMorosas: 3, deudaMorosa: '200.00' },
		],
		alertas: {
			emailsInvalidos: 0,
			comprobantesPendientes: 1,
			comprobantesFallidos: 2,
			anulacionesPendientes: 3,
			certificado: { estado: 'ausente', vencimiento: null, diasRestantes: null },
			ultimoJob: null,
		},
	};
}
describe('dashboard conciliable', () => {
	test('conserva actuales globales aunque morosos superen activos y neto difiera de barras', () => {
		const result = interpretarDashboard(payload(), selected);
		expect(result.actuales.sociosMorosos).toBe(2);
		expect(result.actuales.sociosActivos).toBe(1);
		expect(result.finanzas.neto).toBe('-50.00');
		expect(result.morosidadPorDeporte[0]?.deudaMorosa).toBe('200.00');
	});
	test('no reemplaza cero válido ni falta de certificado por un vencimiento calculado', () => {
		const p = payload();
		p.actuales.deudaTotal = '0.00';
		p.morosidadPorDeporte = [];
		const result = interpretarDashboard(p, selected);
		expect(result.actuales.deudaTotal).toBe('0.00');
		expect(result.alertas.certificado).toEqual({
			estado: 'ausente',
			vencimiento: null,
			diasRestantes: null,
		});
	});
	test('rechaza payload faltante y un mes distinto del solicitado', () => {
		expect(() => interpretarDashboard(null, selected)).toThrow();
		const p = payload();
		p.periodo.mes = 2;
		expect(() => interpretarDashboard(p, selected)).toThrow();
	});
	test('la ventana contiene seis meses hasta el seleccionado, con cambio de año', () => {
		expect(
			interpretarDashboard(payload(), selected).meses.map((m) => `${m.anio}-${m.mes}`),
		).toEqual(['2025-8', '2025-9', '2025-10', '2025-11', '2025-12', '2026-1']);
		const p = payload();
		p.meses = p.meses.map((row, i) => (i === 0 ? { ...row, mes: 7 } : row));
		expect(() => interpretarDashboard(p, selected)).toThrow();
	});
	test('no expone campos privados añadidos a la respuesta', () => {
		const p = { ...payload(), certificadoPrivado: 'no debe salir', token: 'no debe salir' };
		expect(interpretarDashboard(p, selected)).not.toHaveProperty('certificadoPrivado');
		expect(interpretarDashboard(p, selected)).not.toHaveProperty('token');
	});
	test('rechaza cantidades, importes y distribuciones inválidas sin convertir a cero', () => {
		const p = payload();
		p.actuales.sociosMorosos = -1;
		expect(() => interpretarDashboard(p, selected)).toThrow();
		const m = payload();
		m.finanzas.neto = 'NaN';
		expect(() => interpretarDashboard(m, selected)).toThrow();
		const d = payload();
		d.morosidadPorDeporte = [...d.morosidadPorDeporte, ...d.morosidadPorDeporte];
		expect(() => interpretarDashboard(d, selected)).toThrow();
	});
	test('distingue certificado próximo hoy/30 días y rechaza ausente disfrazado de cero', () => {
		const p = payload();
		Object.assign(p.alertas, {
			certificado: {
				estado: 'proximo',
				vencimiento: '2026-10-26',
				diasRestantes: 0,
			},
		});
		expect(interpretarDashboard(p, selected).alertas.certificado.estado).toBe('proximo');
		Object.assign(p.alertas, {
			certificado: {
				estado: 'proximo',
				vencimiento: '2026-11-25',
				diasRestantes: 30,
			},
		});
		expect(interpretarDashboard(p, selected).alertas.certificado.diasRestantes).toBe(30);
		Object.assign(p.alertas, {
			certificado: { estado: 'ausente', vencimiento: null, diasRestantes: 0 },
		});
		expect(() => interpretarDashboard(p, selected)).toThrow();
	});
	test('el día del club cerca de medianoche determina período inicial', () => {
		expect(periodoDashboardActual(new Date('2026-02-01T02:59:59Z'))).toEqual({
			mes: 1,
			anio: 2026,
		});
		expect(periodoDashboardActual(new Date('2026-02-01T03:00:00Z'))).toEqual({
			mes: 2,
			anio: 2026,
		});
	});
	test('usa días calendario inclusivos y febrero bisiesto para enlaces', () => {
		expect(diasPeriodoDashboard({ mes: 2, anio: 2024 })).toEqual({
			desde: '2024-02-01',
			hasta: '2024-02-29',
		});
		const links = enlacesDashboard(selected);
		expect(links.morosos).toBe('/socios?estadoPago=moroso');
		expect(links.deuda).toBe('/pagos?tab=cuotas&estadoCuota=pendiente');
		expect(links.pagos).toContain('desde=2026-01-01&hasta=2026-01-31');
		expect(links.movimientos).toContain('tab=movimientos');
	});
	test('separa los tres grupos fiscales y no ofrece reintentar todos', () => {
		const r = interpretarDashboard(payload(), selected);
		expect(r.alertas.comprobantesPendientes).toBe(1);
		expect(r.alertas.comprobantesFallidos).toBe(2);
		expect(r.alertas.anulacionesPendientes).toBe(3);
		expect(enlacesDashboard(selected).fiscal).toBe('/monitoreo-fiscal');
	});
	test('acepta límites históricos Buenos Aires sin imponer UTC-3 durante horario de verano', () => {
		const p = payload();
		p.periodo = {
			mes: 1,
			anio: 2008,
			desde: '2008-01-01T02:00:00Z',
			hasta: '2008-02-01T02:00:00Z',
		};
		p.meses = [8, 9, 10, 11, 12, 1].map((mes, i) => ({
			mes,
			anio: i === 5 ? 2008 : 2007,
			ingresosOriginales: '0.00',
			egresosOriginales: '0.00',
			neto: '0.00',
		}));
		expect(interpretarDashboard(p, { mes: 1, anio: 2008 }).periodo.mes).toBe(1);
	});
});
