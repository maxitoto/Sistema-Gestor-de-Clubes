export interface CodigoConsultaSerieFiscal {
	codigo: string;
	mensaje: string;
}
interface ConsultaSerieBase {
	ambiente: 'homologacion';
	servicio: 'wsfe';
	operacion: 'FECompUltimoAutorizado';
	puntoVentaConfigurado: number;
	tipoComprobante: number;
	codigos: CodigoConsultaSerieFiscal[];
}
export type ResultadoConsultaSerieFiscal = ConsultaSerieBase &
	(
		| { resultado: 'obtenido'; ultimoAutorizado: string }
		| { resultado: 'no_disponible'; ultimoAutorizado: null }
	);
const ERROR = 'No se pudo verificar la respuesta de la consulta de serie de homologación.';
type FilaConsultaSerie = {
	[K in
		| keyof ConsultaSerieBase
		| keyof CodigoConsultaSerieFiscal
		| 'resultado'
		| 'ultimoAutorizado']?: unknown;
};
function object(value: unknown): FilaConsultaSerie {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(ERROR);
	}
	return value as FilaConsultaSerie;
}
function entero(value: unknown, max: number): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max;
}
/** El cuerpo no admite identidad fiscal ni credenciales desde el navegador. */
export function crearConsultaSerieRequest(tipoComprobante: number): { tipoComprobante: number } {
	if (!entero(tipoComprobante, 999)) {
		throw new Error('Elegí un tipo de comprobante válido para consultar.');
	}
	return { tipoComprobante };
}
/** Conserva exclusivamente el contrato público y comprueba el tipo solicitado. */
export function parseConsultaSerieFiscal(
	value: unknown,
	tipoSolicitado: number,
): ResultadoConsultaSerieFiscal {
	crearConsultaSerieRequest(tipoSolicitado);
	const row = object(value);
	if (
		row.ambiente !== 'homologacion' ||
		row.servicio !== 'wsfe' ||
		row.operacion !== 'FECompUltimoAutorizado' ||
		!entero(row.puntoVentaConfigurado, 99_999) ||
		!entero(row.tipoComprobante, 999) ||
		row.tipoComprobante !== tipoSolicitado ||
		!Array.isArray(row.codigos) ||
		row.codigos.length > 30
	) {
		throw new Error(ERROR);
	}
	const codigos = row.codigos.map((value): CodigoConsultaSerieFiscal => {
		const code = object(value);
		if (
			typeof code.codigo !== 'string' ||
			!/^(?:[0-9]{1,8}|[A-Z][A-Z0-9_]{0,79})$/.test(code.codigo) ||
			typeof code.mensaje !== 'string' ||
			!code.mensaje ||
			code.mensaje.length > 512 ||
			code.mensaje.trim() !== code.mensaje ||
			Array.from(code.mensaje).some(
				(character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
			)
		) {
			throw new Error(ERROR);
		}
		return { codigo: code.codigo, mensaje: code.mensaje };
	});
	const base: ConsultaSerieBase = {
		ambiente: 'homologacion',
		servicio: 'wsfe',
		operacion: 'FECompUltimoAutorizado',
		puntoVentaConfigurado: row.puntoVentaConfigurado,
		tipoComprobante: row.tipoComprobante,
		codigos,
	};
	if (row.resultado === 'obtenido') {
		if (
			typeof row.ultimoAutorizado !== 'string' ||
			!/^(?:0|[1-9][0-9]{0,11})$/.test(row.ultimoAutorizado) ||
			codigos.length !== 0
		) {
			throw new Error(ERROR);
		}
		return { ...base, resultado: 'obtenido', ultimoAutorizado: row.ultimoAutorizado };
	}
	if (row.resultado !== 'no_disponible' || row.ultimoAutorizado !== null || codigos.length === 0) {
		throw new Error(ERROR);
	}
	return { ...base, resultado: 'no_disponible', ultimoAutorizado: null };
}
