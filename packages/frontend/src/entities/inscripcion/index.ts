export {
	confirmarInscripcion,
	consultarResultadoInscripcion,
	getCargosDelPeriodo,
	getFechaActualClub,
	previsualizarInscripcion,
	recuperarInscripcion,
} from './api/inscripciones.api';
export type {
	CargoPeriodo,
	ConfirmacionInscripcion,
	CuotaPersistida,
	IdentidadInscripcion,
	InscripcionPersistida,
	PeriodoInscripcion,
	PrevisualizacionInscripcion,
	RecuperacionInscripcion,
	ResultadoInscripcion,
	VistaPreviaInscripcion,
} from './model/inscripcionContract';
export {
	comprobarRecuperacion,
	mismaVistaPrevia,
	parseConfirmacionInscripcion,
	periodoDeFecha,
	RespuestaInscripcionIncierta,
} from './model/inscripcionContract';
