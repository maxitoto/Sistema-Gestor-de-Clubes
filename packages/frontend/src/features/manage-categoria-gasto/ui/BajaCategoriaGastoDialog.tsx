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
import {
	type CategoriaGasto,
	darBajaCategoriaGasto,
	describirErrorCategoriaGasto,
	getCategoriaGasto,
} from '#entities/categoria-gasto';
import { useAuth } from '#entities/session';
import { useVerifiedMutation } from '#shared/lib/useVerifiedMutation';
export function BajaCategoriaGastoDialog({
	categoria,
	onClose,
	onSaved,
}: {
	categoria: CategoriaGasto;
	onClose: () => void;
	onSaved: () => void;
}) {
	const { cacheScope, profileStatus, perfil, isSigningOut } = useAuth();
	const mutation = useVerifiedMutation<null, CategoriaGasto>({
		cacheScope,
		enabled: profileStatus === 'ready' && perfil?.rol === 'admin' && !isSigningOut,
		queryRoots: ['categorias-gasto'],
		write: (_, signal) => darBajaCategoriaGasto(categoria.id, perfil?.id ?? '', signal),
		read: (signal) => getCategoriaGasto(categoria.id, signal),
		matches: (row) => row.estado === 'inactivo',
		onConfirmed: onSaved,
		describeError: describirErrorCategoriaGasto,
	});
	return (
		<Dialog
			open
			fullWidth
			maxWidth="sm"
			onClose={() => {
				if (!mutation.isPending) {
					onClose();
				}
			}}
		>
			<DialogTitle>Dar de baja categoría</DialogTitle>
			<DialogContent>
				<Stack spacing={2}>
					<Typography>¿Dar de baja «{categoria.nombre}»?</Typography>
					<Alert severity="warning">
						Dejará de ofrecerse para gastos nuevos. Los gastos ya registrados conservarán su
						categoría e historial.
					</Alert>
					{mutation.feedback && (
						<Alert severity={mutation.requiresCheck ? 'warning' : 'error'}>
							{mutation.feedback}
						</Alert>
					)}
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button disabled={mutation.isPending} onClick={onClose}>
					Cancelar
				</Button>
				{mutation.requiresCheck ? (
					<Button disabled={mutation.isPending} onClick={() => void mutation.reconcile()}>
						Consultar resultado
					</Button>
				) : (
					<Button
						variant="contained"
						color="error"
						disabled={mutation.isPending || !mutation.enabled}
						onClick={() => void mutation.run(null)}
					>
						Dar de baja
					</Button>
				)}
			</DialogActions>
		</Dialog>
	);
}
