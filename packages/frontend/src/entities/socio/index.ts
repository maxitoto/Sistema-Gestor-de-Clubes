export type {
	ActualizarSocioPayload,
	CrearSocioPayload,
	GetSociosParams,
	SocioCreado,
	SocioDetalle,
	SocioListado,
} from './api/socios.api';
export {
	actualizarSocio,
	buscarSocioPorDni,
	cambiarEstadoSocio,
	crearSocio,
	getResumenSocio,
	getSocio,
	getSociosReporte,
} from './api/socios.api';
export type { SocioForm, SocioFormErrors } from './model/socioForm';
export {
	coincideEdicionSocio,
	edadSocio,
	fechaBuenosAires,
	fechaCalendarioValida,
	formularioDesdeSocio,
	formularioSocioInicial,
	normalizarDocumentoSocio,
	payloadEdicionSocio,
	validarSocioForm,
} from './model/socioForm';
export type { CriteriosSocios, SocioReporte } from './model/sociosReporte';
export { criteriosSociosDesdeUrl } from './model/sociosReporte';
export { useResumenSocio, useSocio } from './model/useSocio';
export type { UseSociosOptions } from './model/useSocios';
export { useSocios } from './model/useSocios';
export { SocioFields } from './ui/SocioFields';
