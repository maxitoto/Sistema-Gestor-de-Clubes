import { buscarDeportePorNombre, crearDeporte, type Deporte } from '#entities/deporte';
import { useAuth } from '#entities/session';
import { useHumanCreate } from '#shared/lib/useHumanCreate.ts';
export function useCreateDeporte(onCreated: (deporte: Deporte) => void) {
	const { cacheScope, profileStatus, perfil, isSigningOut } = useAuth();
	return useHumanCreate({
		cacheScope,
		enabled:
			profileStatus === 'ready' &&
			perfil?.rol === 'admin' &&
			perfil.estado === 'activo' &&
			!isSigningOut,
		queryRoot: 'deportes',
		create: crearDeporte,
		lookup: buscarDeportePorNombre,
		onCreated,
	});
}
