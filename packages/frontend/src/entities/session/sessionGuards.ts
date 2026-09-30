export const INACTIVITY_MS = 30 * 60 * 1000;

// El reloj se compara antes de aceptar una nueva interacción: volver de suspensión
// no debe renovar una sesión que ya venció.
export function inactivityExpired(lastActivity: number, now = Date.now()): boolean {
	return !Number.isFinite(lastActivity) || now - lastActivity >= INACTIVITY_MS;
}

export function activityKey(userId: string): string {
	return `club:last-activity:${userId}`;
}

export class RequestGeneration {
	private value = 0;
	next(): number {
		return ++this.value;
	}

	isCurrent(value: number): boolean {
		return value === this.value;
	}
}
