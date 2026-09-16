export type ClubUpdate = {
	id: string;
	nombre: string;
	cuit: string;
	domicilioFiscal: string;
	emailContacto: string;
	puntoVenta: number;
	logoUrl: string | null;
};

export type ClubUpdateUi = Partial<Omit<ClubUpdate, 'id' | 'updatedAt'>>;
