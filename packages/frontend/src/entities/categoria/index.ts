export type {
	Categoria,
	CategoriaSuperpuesta,
	CrearCategoriaPayload,
	EditarCategoriaPayload,
} from './api/categorias.api';
export {
	actualizarCategoria,
	buscarCategoriaPorIdentidad,
	consultarSuperposicion,
	crearCategoria,
	darDeBajaCategoria,
	getCategoria,
	getCategorias,
	getCategoriasActivasPorDeporte,
} from './api/categorias.api';
export { describirErrorCategoria } from './model/categoriaErrors';
export type { CategoriaForm, CategoriaFormErrors } from './model/categoriaForm';
export { validarCategoriaForm } from './model/categoriaForm';
export type { CategoriasQueryOptions } from './model/useCategorias';
export { useCategorias, useCategoriasActivasPorDeporte } from './model/useCategorias';
