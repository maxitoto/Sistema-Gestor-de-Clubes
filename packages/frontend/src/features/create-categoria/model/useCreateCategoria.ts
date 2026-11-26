import { buscarCategoriaPorIdentidad, type Categoria, crearCategoria } from '#entities/categoria';
import { useAuth } from '#entities/session';
import { useHumanCreate } from '#shared/lib/useHumanCreate.ts';
export function useCreateCategoria(onCreated: (categoria: Categoria) => void) {
	const { cacheScope, profileStatus, perfil, isSigningOut } = useAuth();
	return useHumanCreate({
		cacheScope,
		enabled:
			profileStatus === 'ready' &&
			perfil?.rol === 'admin' &&
			perfil.estado === 'activo' &&
			!isSigningOut,
		queryRoot: 'categorias',
		create: crearCategoria,
		lookup: buscarCategoriaPorIdentidad,
		onCreated,
		messages: {
			duplicate:
				'Ya existe una categoría con ese nombre dentro del deporte. No se creó otro registro.',
			validation: 'El servidor rechazó los datos. Revisá el nombre, el arancel y las edades.',
		},
	});
}
