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
		messages: {
			duplicate: 'Ya existe un deporte con ese nombre. No se creó otro registro.',
			validation: 'El servidor rechazó los datos. Revisá el nombre y la descripción del deporte.',
		},
	});
}
