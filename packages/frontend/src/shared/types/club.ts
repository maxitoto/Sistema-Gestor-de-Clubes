import type { Tables, TablesUpdate } from './model';

// El id se usa para localizar la fila y no forma parte del payload editable.
export type ClubEditableFields =
	| 'nombre'
	| 'cuit'
	| 'domicilio_fiscal'
	| 'email_contacto'
	| 'punto_venta'
	| 'logo_url';
export type ClubConfig = Pick<Tables<'club'>, 'id' | ClubEditableFields>;
export type ClubUpdate = Pick<TablesUpdate<'club'>, ClubEditableFields>;
export type ClubUpdateUi = ClubUpdate;
