import { describe, expect, spyOn, test } from 'bun:test';
import { cederExportacion } from '../src/shared/lib/export/types';

class PuertoControlado {
	onmessage: (() => void) | null = null;
	cierres = 0;
	mensajes = 0;
	fallaEnvio = false;
	close() {
		this.cierres++;
	}
	postMessage() {
		this.mensajes++;
		if (this.fallaEnvio) {
			throw new Error('Fallo sintético del canal');
		}
	}
}
class CanalControlado {
	static creados: CanalControlado[] = [];
	static fallarEnvio = false;
	port1 = new PuertoControlado();
	port2 = new PuertoControlado();
	constructor() {
		this.port2.fallaEnvio = CanalControlado.fallarEnvio;
		CanalControlado.creados.push(this);
	}
}
async function conCanal<T>(
	constructorCanal: typeof MessageChannel | undefined,
	run: () => Promise<T>,
): Promise<T> {
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'MessageChannel');
	Object.defineProperty(globalThis, 'MessageChannel', {
		value: constructorCanal,
		configurable: true,
		writable: true,
	});
	try {
		return await run();
	} finally {
		if (descriptor) {
			Object.defineProperty(globalThis, 'MessageChannel', descriptor);
		} else {
			Reflect.deleteProperty(globalThis, 'MessageChannel');
		}
		CanalControlado.creados = [];
		CanalControlado.fallarEnvio = false;
	}
}
const canalPrueba = CanalControlado as unknown as typeof MessageChannel;
describe('yield cancelable de exportación', () => {
	test('el canal real de la plataforma completa un turno', async () => {
		await expect(cederExportacion()).resolves.toBeUndefined();
	});
	test('MessageChannel cede de forma asíncrona sin programar temporizadores y cierra ambos puertos', async () => {
		await conCanal(canalPrueba, async () => {
			const timer = spyOn(globalThis, 'setTimeout');
			try {
				let completo = false;
				const p = cederExportacion().then(() => {
					completo = true;
				});
				const c = CanalControlado.creados[0];
				expect(completo).toBe(false);
				expect(c?.port2.mensajes).toBe(1);
				expect(timer).not.toHaveBeenCalled();
				c?.port1.onmessage?.();
				await p;
				expect(completo).toBe(true);
				expect(c?.port1.cierres).toBe(1);
				expect(c?.port2.cierres).toBe(1);
				expect(c?.port1.onmessage).toBeNull();
			} finally {
				timer.mockRestore();
			}
		});
	});
	test('cancelar mientras espera el canal rechaza y retira el listener y los puertos', async () => {
		await conCanal(canalPrueba, async () => {
			const controller = new AbortController();
			const retirar = spyOn(controller.signal, 'removeEventListener');
			try {
				const p = cederExportacion(controller.signal);
				const resultado = p.then(
					() => null,
					(error: unknown) => error,
				);
				const c = CanalControlado.creados[0];
				controller.abort();
				expect(await resultado).toMatchObject({ name: 'AbortError' });
				expect(c?.port1.cierres).toBe(1);
				expect(c?.port2.cierres).toBe(1);
				expect(c?.port1.onmessage).toBeNull();
				expect(retirar).toHaveBeenCalledTimes(1);
			} finally {
				retirar.mockRestore();
			}
		});
	});
	test('una señal ya cancelada no crea canales ni listeners', async () => {
		await conCanal(canalPrueba, async () => {
			const controller = new AbortController();
			controller.abort();
			const agregar = spyOn(controller.signal, 'addEventListener');
			try {
				await expect(cederExportacion(controller.signal)).rejects.toMatchObject({
					name: 'AbortError',
				});
				expect(CanalControlado.creados).toHaveLength(0);
				expect(agregar).not.toHaveBeenCalled();
			} finally {
				agregar.mockRestore();
			}
		});
	});
	test('al completar retira el listener aunque la señal se aborte después', async () => {
		await conCanal(canalPrueba, async () => {
			const controller = new AbortController();
			const retirar = spyOn(controller.signal, 'removeEventListener');
			try {
				const p = cederExportacion(controller.signal);
				const c = CanalControlado.creados[0];
				c?.port1.onmessage?.();
				await p;
				controller.abort();
				expect(retirar).toHaveBeenCalledTimes(1);
				expect(c?.port1.cierres).toBe(1);
				expect(c?.port2.cierres).toBe(1);
			} finally {
				retirar.mockRestore();
			}
		});
	});
	test('fallback sin MessageChannel usa un temporizador y lo limpia', async () => {
		await conCanal(undefined, async () => {
			const timer = spyOn(globalThis, 'setTimeout'),
				limpiar = spyOn(globalThis, 'clearTimeout');
			try {
				await expect(cederExportacion()).resolves.toBeUndefined();
				expect(timer).toHaveBeenCalledTimes(1);
				expect(limpiar).toHaveBeenCalledTimes(1);
			} finally {
				timer.mockRestore();
				limpiar.mockRestore();
			}
		});
	});
	test('cancelar el fallback limpia su temporizador pendiente', async () => {
		await conCanal(undefined, async () => {
			const controller = new AbortController();
			const limpiar = spyOn(globalThis, 'clearTimeout');
			try {
				const p = cederExportacion(controller.signal);
				const resultado = p.then(
					() => null,
					(error: unknown) => error,
				);
				controller.abort();
				expect(await resultado).toMatchObject({ name: 'AbortError' });
				expect(limpiar).toHaveBeenCalledTimes(1);
			} finally {
				limpiar.mockRestore();
			}
		});
	});
	test('un error al publicar no deja recursos pendientes', async () => {
		await conCanal(canalPrueba, async () => {
			CanalControlado.fallarEnvio = true;
			const controller = new AbortController();
			const retirar = spyOn(controller.signal, 'removeEventListener');
			try {
				await expect(cederExportacion(controller.signal)).rejects.toThrow(
					'Fallo sintético del canal',
				);
				const c = CanalControlado.creados[0];
				expect(c?.port1.cierres).toBe(1);
				expect(c?.port2.cierres).toBe(1);
				expect(retirar).toHaveBeenCalledTimes(1);
			} finally {
				retirar.mockRestore();
			}
		});
	});
});
