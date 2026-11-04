export type { Categoria, CategoriaSuperpuesta, CrearCategoriaPayload } from './api/categorias.api';
export {
	buscarCategoriaPorIdentidad,
	consultarSuperposicion,
	crearCategoria,
	getCategorias,
	getCategoriasActivasPorDeporte,
} from './api/categorias.api';
export type { CategoriasQueryOptions } from './model/useCategorias';
export { useCategorias, useCategoriasActivasPorDeporte } from './model/useCategorias';
