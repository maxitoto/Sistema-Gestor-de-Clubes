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
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '#entities/session';
import { getEstadoUsuario, type Usuario } from '#entities/usuario';
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
		<Dialog open fullWidth maxWidth="sm" onClose={onClose}>
			<DialogTitle>Estado de la cuenta</DialogTitle>
			<DialogContent>
				<Stack spacing={2}>
					<Typography>
						{usuario.nombre} {usuario.apellido} · {usuario.email}
					</Typography>
					{query.isPending ? (
						<Typography>Consultando gestión…</Typography>
					) : query.isError ? (
						<Alert
							severity="error"
							action={<Button onClick={() => void query.refetch()}>Reintentar</Button>}
						>
							No pudimos consultar el estado.
						</Alert>
					) : query.data ? (
						<>
							<Alert severity={query.data.resultado === 'completo' ? 'success' : 'warning'}>
								{query.data.mensaje}
							</Alert>
							{query.data.puedeReenviar && (
								<Typography color="text.secondary">
									Podés enviar un nuevo enlace. Antes, revisá si la persona recibió el anterior; un
									nuevo enlace reemplaza al previo.
								</Typography>
							)}
						</>
					) : (
						<Alert severity="info">
							No hay gestiones administrativas registradas para esta cuenta.
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
