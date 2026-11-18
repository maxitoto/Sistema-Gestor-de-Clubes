import {
	Alert,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Stack,
	Typography,
} from '@mui/material';
import { useId } from 'react';
import {
	type Categoria,
	darDeBajaCategoria,
	describirErrorCategoria,
	getCategoria,
} from '#entities/categoria';
import {
	type Deporte,
	darDeBajaDeporte,
	describirErrorDeporte,
	getDeporte,
} from '#entities/deporte';
import { useAuth } from '#entities/session';
import { useVerifiedMutation } from '#shared/lib/useVerifiedMutation';

export type CatalogoBajaTarget =
	| { tipo: 'deporte'; registro: Deporte }
	| { tipo: 'categoria'; registro: Categoria };
export function DeactivateCatalogoDialog({
	target,
	onClose,
	onChanged,
}: {
	target: CatalogoBajaTarget;
	onClose: () => void;
	onChanged: () => void;
}) {
	const titleId = useId();
	const { cacheScope, profileStatus, perfil, isSigningOut } = useAuth();
	const mutation = useVerifiedMutation<true, Deporte | Categoria>({
		cacheScope,
		enabled:
			profileStatus === 'ready' &&
			perfil?.rol === 'admin' &&
			perfil.estado === 'activo' &&
			!isSigningOut,
		queryRoots: ['deportes', 'categorias', 'inscripciones'],
		write: (_payload, signal) =>
			target.tipo === 'deporte'
				? darDeBajaDeporte(target.registro.id, signal)
				: darDeBajaCategoria(target.registro.id, signal),
		read: (signal) =>
			target.tipo === 'deporte'
				? getDeporte(target.registro.id, signal)
				: getCategoria(target.registro.id, signal),
		matches: (row) => row.estado === 'inactivo',
		onConfirmed: onChanged,
		describeError: target.tipo === 'deporte' ? describirErrorDeporte : describirErrorCategoria,
	});
	return (
		<Dialog
			open
			fullWidth
			maxWidth="sm"
			aria-labelledby={titleId}
			onClose={() => {
				if (!mutation.isPending) {
					onClose();
				}
			}}
		>
			<DialogTitle id={titleId}>
				Dar de baja {target.tipo === 'deporte' ? 'deporte' : 'categoría'}
			</DialogTitle>
			<DialogContent>
				<Stack spacing={2}>
					<Typography>
						¿Confirmás la baja de <strong>{target.registro.nombre}</strong>?
					</Typography>
					<Typography variant="body2" color="text.secondary">
						El registro quedará inactivo y conservará su historial.{' '}
						{target.tipo === 'deporte'
							? 'No puede tener categorías activas.'
							: 'No puede tener inscripciones activas. Las cuotas emitidas se conservan.'}
					</Typography>
					{mutation.feedback && (
						<Alert severity={mutation.requiresCheck ? 'warning' : 'error'}>
							{mutation.feedback}
						</Alert>
					)}
					{mutation.requiresCheck && (
						<Button disabled={mutation.isPending} onClick={() => void mutation.reconcile()}>
							Consultar estado guardado
						</Button>
					)}
				</Stack>
			</DialogContent>
			<DialogActions sx={{ borderTop: 1, borderColor: 'divider' }}>
				<Button variant="outlined" color="inherit" disabled={mutation.isPending} onClick={onClose}>
					Cancelar
				</Button>
				<Button
					variant="contained"
					color="error"
					disabled={mutation.isPending || mutation.requiresCheck || !mutation.enabled}
					onClick={() => void mutation.run(true)}
				>
					{mutation.isPending ? 'Verificando…' : 'Confirmar baja'}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
