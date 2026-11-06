import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import {
	Alert,
	Box,
	Button,
	Chip,
	MenuItem,
	Paper,
	Stack,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TablePagination,
	TableRow,
	TextField,
	Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuth } from '#entities/session';
import {
	type AccionUsuario,
	getUsuarios,
	type ResultadoUsuario,
	type Usuario,
} from '#entities/usuario';
import { UsuarioActionDialog, UsuarioDialog, UsuarioEstadoDialog } from '#features/manage-usuario';
export function UsuariosPage() {
	const { cacheScope, profileStatus, perfil } = useAuth();
	return (
		<UsuariosPanel
			key={cacheScope}
			scope={cacheScope}
			enabled={profileStatus === 'ready' && perfil?.rol === 'admin'}
			actorId={perfil?.id ?? ''}
		/>
	);
}
function UsuariosPanel({
	scope,
	enabled,
	actorId,
}: {
	scope: string;
	enabled: boolean;
	actorId: string;
}) {
	const [page, setPage] = useState(0);
	const [size, setSize] = useState(20);
	const [search, setSearch] = useState('');
	const [term, setTerm] = useState('');
	const [estado, setEstado] = useState('todos');
	const [rol, setRol] = useState('todos');
	const [edit, setEdit] = useState<{ usuario: Usuario | null } | null>(null);
	const [action, setAction] = useState<{ usuario: Usuario; accion: AccionUsuario } | null>(null);
	const [statusUser, setStatusUser] = useState<Usuario | null>(null);
	const [result, setResult] = useState<ResultadoUsuario | null>(null);
	useEffect(() => {
		const timer = setTimeout(() => {
			setTerm(search);
			setPage(0);
		}, 300);
		return () => clearTimeout(timer);
	}, [search]);
	const list = useQuery({
		queryKey: ['usuarios', scope, { page, size, term, estado, rol }],
		queryFn: ({ signal }) =>
			getUsuarios({ page, pageSize: size, search: term, estado, rol }, signal),
		enabled,
		retry: 1,
	});
	useEffect(() => {
		if (list.data) {
			const last = Math.max(0, Math.ceil(list.data.total / size) - 1);
			if (page > last) {
				setPage(last);
			}
		}
	}, [list.data, size, page]);
	const saved = (r: ResultadoUsuario) => {
		setResult(r);
		if (r.resultado === 'completo' || r.resultado === 'rechazado') {
			setEdit(null);
			setAction(null);
		}
		void list.refetch();
	};
	return (
		<Stack spacing={3}>
			<Box>
				<Typography variant="h4" component="h1">
					Usuarios del sistema
				</Typography>
				<Typography color="text.secondary" sx={{ mt: 1 }}>
					Administrá las cuentas internas y sus permisos de acceso.
				</Typography>
			</Box>
			{result && (
				<Alert
					severity={result.resultado === 'completo' ? 'success' : 'warning'}
					onClose={() => setResult(null)}
				>
					{result.mensaje}
					{result.resultado !== 'completo' &&
						' Consultá la cuenta para completar la acción pendiente.'}
				</Alert>
			)}
			<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
				<Stack spacing={2}>
					<Stack
						direction={{ xs: 'column', sm: 'row' }}
						spacing={2}
						sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
					>
						<Typography component="h2" variant="h6">
							Cuentas de acceso
						</Typography>
						<Button
							variant="contained"
							startIcon={<PersonAddAltOutlinedIcon />}
							disabled={!enabled}
							onClick={() => setEdit({ usuario: null })}
						>
							Nuevo usuario
						</Button>
					</Stack>
					<Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
						<TextField
							size="small"
							label="Buscar nombre o correo"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							sx={{ flex: 1 }}
						/>
						<TextField
							size="small"
							select
							label="Rol"
							value={rol}
							onChange={(e) => {
								setRol(e.target.value);
								setPage(0);
							}}
							sx={{ minWidth: 180 }}
						>
							<MenuItem value="todos">Todos los roles</MenuItem>
							<MenuItem value="admin">Administrador</MenuItem>
							<MenuItem value="responsable">Responsable</MenuItem>
						</TextField>
						<TextField
							size="small"
							select
							label="Estado"
							value={estado}
							onChange={(e) => {
								setEstado(e.target.value);
								setPage(0);
							}}
							sx={{ minWidth: 150 }}
						>
							<MenuItem value="todos">Todos</MenuItem>
							<MenuItem value="activo">Activo</MenuItem>
							<MenuItem value="inactivo">Inactivo</MenuItem>
						</TextField>
					</Stack>
					{list.isError ? (
						<Alert
							severity="error"
							action={<Button onClick={() => void list.refetch()}>Reintentar</Button>}
						>
							No pudimos cargar los usuarios.
						</Alert>
					) : (
						<>
							<TableContainer>
								<Table aria-label="Usuarios del sistema" size="small">
									<TableHead>
										<TableRow>
											{['Usuario', 'Rol', 'Estado', 'Acciones'].map((label) => (
												<TableCell key={label}>{label}</TableCell>
											))}
										</TableRow>
									</TableHead>
									<TableBody>
										{list.isPending ? (
											<TableRow>
												<TableCell colSpan={4}>Cargando usuarios…</TableCell>
											</TableRow>
										) : !list.data?.rows.length ? (
											<TableRow>
												<TableCell colSpan={4}>No hay usuarios para estos filtros.</TableCell>
											</TableRow>
										) : (
											list.data.rows.map((u) => (
												<TableRow key={u.id}>
													<TableCell>
														<Typography variant="body2" sx={{ fontWeight: 600 }}>
															{u.apellido}, {u.nombre}
														</Typography>
														<Typography variant="caption" color="text.secondary">
															{u.email}
														</Typography>
													</TableCell>
													<TableCell>
														{u.rol === 'admin' ? 'Administrador' : 'Responsable'}
													</TableCell>
													<TableCell>
														<Chip
															size="small"
															variant="outlined"
															color={u.estado === 'activo' ? 'success' : 'default'}
															label={u.estado === 'activo' ? 'Activo' : 'Inactivo'}
														/>
													</TableCell>
													<TableCell>
														{u.id === actorId ? (
															<Typography variant="caption" color="text.secondary">
																Mi cuenta · gestión protegida
															</Typography>
														) : (
															<Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
																<Button size="small" onClick={() => setStatusUser(u)}>
																	Enlaces y estado
																</Button>
																<Button size="small" onClick={() => setEdit({ usuario: u })}>
																	Editar
																</Button>
																{u.estado === 'activo' && u.rol === 'responsable' && (
																	<Button
																		size="small"
																		onClick={() => setAction({ usuario: u, accion: 'restablecer' })}
																	>
																		Restablecer contraseña
																	</Button>
																)}
																<Button
																	size="small"
																	color={u.estado === 'activo' ? 'error' : 'success'}
																	onClick={() =>
																		setAction({
																			usuario: u,
																			accion: u.estado === 'activo' ? 'desactivar' : 'reactivar',
																		})
																	}
																>
																	{u.estado === 'activo' ? 'Desactivar' : 'Reactivar'}
																</Button>
															</Stack>
														)}
													</TableCell>
												</TableRow>
											))
										)}
									</TableBody>
								</Table>
							</TableContainer>
							<TablePagination
								component="div"
								count={list.data?.total ?? 0}
								page={page}
								rowsPerPage={size}
								rowsPerPageOptions={[20, 50, 100]}
								onPageChange={(_, p) => setPage(p)}
								onRowsPerPageChange={(e) => {
									setSize(Number(e.target.value));
									setPage(0);
								}}
								labelRowsPerPage="Filas por página"
								labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
							/>
						</>
					)}
				</Stack>
			</Paper>
			{statusUser && (
				<UsuarioEstadoDialog
					usuario={statusUser}
					onClose={() => setStatusUser(null)}
					onReenviar={() => {
						setAction({ usuario: statusUser, accion: 'reenviar' });
						setStatusUser(null);
					}}
				/>
			)}
			{edit && (
				<UsuarioDialog usuario={edit.usuario} onClose={() => setEdit(null)} onSaved={saved} />
			)}{' '}
			{action && (
				<UsuarioActionDialog
					usuario={action.usuario}
					accion={action.accion}
					onClose={() => setAction(null)}
					onSaved={saved}
				/>
			)}
		</Stack>
	);
}
