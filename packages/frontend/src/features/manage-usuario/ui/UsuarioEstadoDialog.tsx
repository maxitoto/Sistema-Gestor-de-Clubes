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
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '#entities/session';
import { getEstadoUsuario, type Usuario } from '#entities/usuario';

const formatoFecha = new Intl.DateTimeFormat('es-AR', {
	dateStyle: 'short',
	timeStyle: 'short',
	timeZone: 'America/Argentina/Buenos_Aires',
});

export function UsuarioEstadoDialog({
	usuario,
	onClose,
	onReenviar,
}: {
	usuario: Usuario;
	onClose: () => void;
	onReenviar: () => void;
}) {
	const { perfil, cacheScope, profileStatus } = useAuth();
	const actorId = perfil?.id ?? '';
	const query = useQuery({
		queryKey: ['usuario-gestion', cacheScope, usuario.id],
		queryFn: ({ signal }) => getEstadoUsuario(usuario.id, actorId, signal),
		enabled: profileStatus === 'ready' && perfil?.rol === 'admin' && actorId !== usuario.id,
		retry: 1,
	});

	return (
		<Dialog open fullWidth maxWidth="sm" aria-labelledby="usuario-estado-title" onClose={onClose}>
			<DialogTitle id="usuario-estado-title">Enlaces y estado de la cuenta</DialogTitle>
			<DialogContent dividers>
				<Stack spacing={2}>
					<Paper variant="outlined" sx={{ p: 1.75, bgcolor: 'action.hover' }}>
						<Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
							{usuario.apellido}, {usuario.nombre}
						</Typography>
						<Typography variant="caption" color="text.secondary">
							{usuario.email}
						</Typography>
					</Paper>

					{query.isPending ? (
						<Stack direction="row" spacing={1.5} sx={{ py: 2, alignItems: 'center' }}>
							<CircularProgress size={18} />
							<Typography variant="body2" color="text.secondary">
								Consultando estado de la cuenta…
							</Typography>
						</Stack>
					) : query.isError ? (
						<Alert
							severity="error"
							action={
								<Button size="small" color="inherit" onClick={() => void query.refetch()}>
									Reintentar
								</Button>
							}
						>
							No pudimos consultar el estado de esta cuenta.
						</Alert>
					) : query.data ? (
						<>
							<Alert severity={query.data.resultado === 'completo' ? 'success' : 'warning'}>
								{query.data.mensaje}
							</Alert>
							{query.data.enlaceEnviadoEn && (
								<Typography
									variant="caption"
									color="text.secondary"
									sx={{ fontVariantNumeric: 'tabular-nums' }}
								>
									Último enlace enviado el{' '}
									<strong>{formatoFecha.format(new Date(query.data.enlaceEnviadoEn))}</strong>.
								</Typography>
							)}
							{query.data.puedeReenviar && (
								<Typography variant="body2" color="text.secondary">
									Podés reenviar un enlace nuevo. Antes verificá si la persona ya recibió el
									anterior, ya que el nuevo enlace lo reemplaza.
								</Typography>
							)}
						</>
					) : (
						<Alert severity="info">
							No hay gestiones administrativas pendientes para esta cuenta.
						</Alert>
					)}
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>Cerrar</Button>
				{query.data?.puedeReenviar && (
					<Button variant="contained" onClick={onReenviar}>
						Reenviar enlace
					</Button>
				)}
			</DialogActions>
		</Dialog>
	);
}
