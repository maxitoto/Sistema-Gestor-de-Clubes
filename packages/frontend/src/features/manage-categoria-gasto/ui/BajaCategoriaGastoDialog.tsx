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
			aria-labelledby="baja-categoria-gasto-title"
			onClose={() => {
				if (!mutation.isPending) {
					onClose();
				}
			}}
		>
			<DialogTitle id="baja-categoria-gasto-title">Dar de baja categoría</DialogTitle>
			<DialogContent dividers>
				<Stack spacing={2}>
					<Paper variant="outlined" sx={{ p: 1.75, bgcolor: 'action.hover' }}>
						<Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
							{categoria.nombre}
						</Typography>
						{categoria.descripcion && (
							<Typography variant="caption" color="text.secondary">
								{categoria.descripcion}
							</Typography>
						)}
					</Paper>
					<Alert severity="warning">
						Dejará de aparecer al registrar nuevos gastos. Los gastos ya cargados conservarán su
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
						startIcon={
							mutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined
						}
						disabled={mutation.isPending || !mutation.enabled}
						onClick={() => void mutation.run(null)}
					>
						{mutation.isPending ? 'Confirmando…' : 'Confirmar baja'}
					</Button>
				)}
			</DialogActions>
		</Dialog>
	);
}
