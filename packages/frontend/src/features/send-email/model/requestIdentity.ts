// src/modules/comuniciones/model/requestIdentity.ts

// Reintentar el mismo formulario conserva la clave, incluso si la respuesta se perdió.
export class RequestIdentity {
	private signature: string | null = null;
	private id: string | null = null;
	forPayload(payload: unknown, createId: () => string = () => crypto.randomUUID()): string {
		const signature = JSON.stringify(payload);
		if (signature === undefined) {
			throw new TypeError('El aviso debe contener datos serializables.');
		}
		if (signature !== this.signature || this.id === null) {
			this.signature = signature;
			this.id = createId();
		}
		return this.id;
	}
	reset(): void {
		this.signature = null;
		this.id = null;
	}
}
