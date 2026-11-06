import type { Tables, TablesUpdate } from './model';

export type ClubEditableFields =
	| 'nombre'
	| 'cuit'
	| 'domicilio_fiscal'
	| 'email_contacto'
	| 'punto_venta'
	| 'logo_url';
export type ClubConfig = Pick<Tables<'club'>, 'id' | ClubEditableFields | 'logo_storage_path'>;
export type ClubUpdate = Required<Pick<TablesUpdate<'club'>, ClubEditableFields>>;
export type ClubUpdateUi = ClubUpdate;
