import { describe, expect, test } from 'bun:test';
import {
	INACTIVITY_MS,
	RequestGeneration,
	SessionActivity,
} from '../src/entities/session/sessionGuards';
import {
	parsePasswordCallback,
	validatePassword,
} from '../src/features/set-password/model/passwordForm';

describe('sesión local y respuestas tardías', () => {
	test('vence exactamente a 30min y un refresh no escribe actividad', () => {
		const clock = new SessionActivity(1_000, 1_000);
		expect(clock.expired(1_000 + INACTIVITY_MS - 1)).toBe(false);
		expect(clock.remaining(1_000 + 20 * 60_000)).toBe(10 * 60_000);
		expect(clock.lastActivity).toBe(1_000);
		expect(clock.expired(1_000 + INACTIVITY_MS)).toBe(true);
		expect(clock.interact(1_000 + INACTIVITY_MS, true, true)).toBe(false);
	});
	test('sólo interacción visible y confiable prolonga; volver de suspensión no revive', () => {
		const clock = new SessionActivity(1_000, 1_000);
		expect(clock.interact(2_000, true, false)).toBe(false);
		expect(clock.interact(2_000, false, true)).toBe(false);
		expect(clock.interact(2_000, true, true)).toBe(true);
		expect(clock.lastActivity).toBe(2_000);
		expect(clock.interact(2_000 + INACTIVITY_MS + 1, true, true)).toBe(false);
	});
	test('otra pestaña no acepta marcas futuras ni revive una sesión vencida', () => {
		const clock = new SessionActivity(1_000, 1_000);
		clock.synchronize(20_000, 2_000);
		expect(clock.lastActivity).toBe(1_000);
		clock.synchronize(1_500, 2_000);
		expect(clock.lastActivity).toBe(1_500);
		clock.synchronize(INACTIVITY_MS + 1_600, INACTIVITY_MS + 1_600);
		expect(clock.lastActivity).toBe(1_500);
	});
	test('cambio/cierre descarta resultado de la generación anterior aun si termina después', async () => {
		const generation = new RequestGeneration();
		const first = generation.next();
		let release: (() => void) | undefined;
		let visible = '';
		const slow = new Promise<void>((resolve) => {
			release = resolve;
		}).then(() => {
			if (generation.isCurrent(first)) {
				visible = 'cuenta anterior';
			}
		});
		const second = generation.next();
		visible = 'cuenta actual';
		release?.();
		await slow;
		expect(visible).toBe('cuenta actual');
		expect(generation.isCurrent(first)).toBe(false);
		expect(generation.isCurrent(second)).toBe(true);
	});
});

describe('formulario y callback de contraseña', () => {
	test('mínimo ocho, mayúscula y número sin imponer minúscula', () => {
		expect(validatePassword('Nueva2026', 'Nueva2026')).toBeNull();
		expect(validatePassword('NUEVA2026', 'NUEVA2026')).toBeNull();
		for (const password of ['nueva2026', 'NuevaClave', 'Nu2026']) {
			expect(validatePassword(password, password)).not.toBeNull();
		}
		expect(validatePassword('Nueva2026', 'Otra2026')).toBe('Las contraseñas no coinciden.');
	});
	test('callback sólo invite/recovery y tokenhash único; rechaza tokens de sesión y destinos', () => {
		const hash = 'a'.repeat(56);
		expect(parsePasswordCallback(`#token_hash=${hash}&type=recovery`)).toEqual({
			tokenHash: hash,
			type: 'recovery',
		});
		expect(parsePasswordCallback(`#token_hash=${hash}&type=invite`)).toEqual({
			tokenHash: hash,
			type: 'invite',
		});
		for (const value of [
			'',
			`#token_hash=${hash}&type=signup`,
			'#access_token=token&type=recovery',
			`#token_hash=${hash}&type=recovery&next=https://example.test`,
			`#token_hash=${hash}&type=recovery&type=recovery`,
			'#token_hash=123&type=invite',
		]) {
			expect(parsePasswordCallback(value)).toBeNull();
		}
	});
});
