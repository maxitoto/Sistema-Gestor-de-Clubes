import {
	Alert,
	Button,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Paper,
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
			<DialogContent dividers>
				<Stack spacing={2}>
					<Paper variant="outlined" sx={{ p: 1.75, bgcolor: 'action.hover' }}>
						<Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
							{target.registro.nombre}
						</Typography>
						<Typography variant="caption" color="text.secondary">
							{target.tipo === 'deporte' ? 'Disciplina deportiva' : 'Categoría deportiva'}
						</Typography>
					</Paper>
					<Alert severity="warning">
						El registro quedará inactivo y conservará su historial.{' '}
						{target.tipo === 'deporte'
							? 'No puede tener categorías activas asociadas.'
							: 'No puede tener inscripciones activas. Las cuotas ya emitidas se conservan.'}
					</Alert>
					{mutation.feedback && (
						<Alert severity={mutation.requiresCheck ? 'warning' : 'error'}>
							{mutation.feedback}
						</Alert>
					)}
					{mutation.requiresCheck && (
						<Button
							variant="outlined"
							size="small"
							disabled={mutation.isPending}
							onClick={() => void mutation.reconcile()}
							sx={{ alignSelf: 'flex-start' }}
						>
							Consultar estado guardado
						</Button>
					)}
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button variant="outlined" color="inherit" disabled={mutation.isPending} onClick={onClose}>
					Cancelar
				</Button>
				<Button
					variant="contained"
					color="error"
					startIcon={
						mutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined
					}
					disabled={mutation.isPending || mutation.requiresCheck || !mutation.enabled}
					onClick={() => void mutation.run(true)}
				>
					{mutation.isPending ? 'Confirmando…' : 'Confirmar baja'}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
