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

// La actividad se registra sólo tras comprobar el vencimiento. Los eventos de Auth
// (refresh/reconsulta) no pasan por este reloj ni renuevan su marca.
export class SessionActivity {
	private timestamp: number;
	constructor(lastActivity: number, now: number) {
		this.timestamp =
			Number.isFinite(lastActivity) && lastActivity > 0 && lastActivity <= now ? lastActivity : now;
	}
	get lastActivity(): number {
		return this.timestamp;
	}
	expired(now: number): boolean {
		return inactivityExpired(this.timestamp, now);
	}
	remaining(now: number): number {
		return Math.max(0, INACTIVITY_MS - (now - this.timestamp));
	}
	interact(now: number, visible: boolean, trusted: boolean): boolean {
		if (this.expired(now) || !visible || !trusted) {
			return false;
		}
		this.timestamp = now;
		return true;
	}
	synchronize(value: number, now: number): void {
		if (Number.isFinite(value) && value > this.timestamp && value <= now && !this.expired(now)) {
			this.timestamp = value;
		}
	}
}
