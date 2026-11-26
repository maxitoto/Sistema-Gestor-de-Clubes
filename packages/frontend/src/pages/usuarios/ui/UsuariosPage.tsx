import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import {
	Alert,
	Button,
	Chip,
	CircularProgress,
	InputAdornment,
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
import { EmptyState, PageHeader } from '#shared/ui';

const ESTADO_PILLS = [
	{ value: 'todos', label: 'Todos' },
	{ value: 'activo', label: 'Activos' },
	{ value: 'inactivo', label: 'Inactivos' },
] as const;

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

	const clearFilters = () => {
		setSearch('');
		setTerm('');
		setEstado('todos');
		setRol('todos');
		setPage(0);
	};

	const hasAnyFilter = Boolean(search.trim()) || estado !== 'todos' || rol !== 'todos';

	return (
		<Stack spacing={3}>
			<PageHeader
				title="Usuarios del sistema"
				subtitle="Administrá las cuentas internas, sus roles de acceso y los enlaces de activación."
				actions={
					<Button
						variant="contained"
						startIcon={<PersonAddAltOutlinedIcon />}
						disabled={!enabled}
						onClick={() => setEdit({ usuario: null })}
					>
						Nuevo usuario
					</Button>
				}
			/>

			{result && (
				<Alert
					severity={
						result.resultado === 'completo'
							? 'success'
							: result.resultado === 'rechazado'
								? 'error'
								: 'warning'
					}
					onClose={() => setResult(null)}
				>
					{result.mensaje}
					{result.resultado !== 'completo' &&
						result.resultado !== 'rechazado' &&
						' Consultá «Enlaces y estado» para completar la acción pendiente.'}
				</Alert>
			)}

			<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
				<Stack spacing={2.25}>
					<Stack
						direction={{ xs: 'column', md: 'row' }}
						spacing={1.5}
						sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}
					>
						<TextField
							size="small"
							label="Buscar usuario"
							placeholder="Nombre, apellido o correo…"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							slotProps={{
								input: {
									startAdornment: (
										<InputAdornment position="start">
											<SearchOutlinedIcon fontSize="small" color="action" />
										</InputAdornment>
									),
								},
							}}
							sx={{ flex: 1, minWidth: 220 }}
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
							sx={{ minWidth: 170 }}
						>
							<MenuItem value="todos">Todos los roles</MenuItem>
							<MenuItem value="admin">Administrador</MenuItem>
							<MenuItem value="responsable">Responsable</MenuItem>
						</TextField>

						<Stack
							direction="row"
							spacing={0.75}
							useFlexGap
							sx={{ flexWrap: 'wrap', alignItems: 'center' }}
						>
							{ESTADO_PILLS.map((pill) => {
								const active = estado === pill.value;
								return (
									<Chip
										key={pill.value}
										size="small"
										label={pill.label}
										clickable
										color={active ? 'primary' : 'default'}
										variant={active ? 'filled' : 'outlined'}
										onClick={() => {
											setEstado(pill.value);
											setPage(0);
										}}
									/>
								);
							})}
							{hasAnyFilter && (
								<Button size="small" color="inherit" onClick={clearFilters}>
									Limpiar filtros
								</Button>
							)}
						</Stack>
					</Stack>

					{list.isError ? (
						<Alert
							severity="error"
							action={
								<Button size="small" color="inherit" onClick={() => void list.refetch()}>
									Reintentar
								</Button>
							}
						>
							No pudimos cargar los usuarios.
						</Alert>
					) : (
						<>
							<TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
								<Table aria-label="Usuarios del sistema" size="small">
									<TableHead>
										<TableRow>
											<TableCell>Usuario</TableCell>
											<TableCell>Rol</TableCell>
											<TableCell>Estado</TableCell>
											<TableCell align="right">Acciones</TableCell>
										</TableRow>
									</TableHead>
									<TableBody>
										{list.isPending ? (
											<TableRow>
												<TableCell colSpan={4} sx={{ py: 5 }}>
													<Stack
														direction="row"
														spacing={1.5}
														sx={{ justifyContent: 'center', alignItems: 'center' }}
													>
														<CircularProgress size={20} />
														<Typography variant="body2" color="text.secondary">
															Cargando usuarios…
														</Typography>
													</Stack>
												</TableCell>
											</TableRow>
										) : !list.data?.rows.length ? (
											<TableRow>
												<TableCell colSpan={4} sx={{ borderBottom: 0 }}>
													<EmptyState
														icon={<ManageAccountsOutlinedIcon />}
														title="No encontramos usuarios para estos filtros"
														description="Probá ajustando el rol, el estado o el texto de búsqueda."
														action={
															hasAnyFilter ? (
																<Button variant="outlined" size="small" onClick={clearFilters}>
																	Limpiar filtros
																</Button>
															) : null
														}
													/>
												</TableCell>
											</TableRow>
										) : (
											list.data.rows.map((u) => (
												<TableRow key={u.id} sx={{ opacity: u.estado === 'activo' ? 1 : 0.68 }}>
													<TableCell>
														<Typography variant="body2" sx={{ fontWeight: 600 }}>
															{u.apellido}, {u.nombre}
														</Typography>
														<Typography variant="caption" color="text.secondary">
															{u.email}
														</Typography>
													</TableCell>
													<TableCell>
														<Chip
															size="small"
															color={u.rol === 'admin' ? 'info' : 'default'}
															label={u.rol === 'admin' ? 'Administrador' : 'Responsable'}
														/>
													</TableCell>
													<TableCell>
														<Chip
															size="small"
															color={u.estado === 'activo' ? 'success' : 'default'}
															label={u.estado === 'activo' ? 'Activo' : 'Inactivo'}
														/>
													</TableCell>
													<TableCell align="right">
														{u.id === actorId ? (
															<Chip size="small" variant="outlined" label="Tu cuenta" />
														) : (
															<Stack
																direction="row"
																spacing={0.5}
																useFlexGap
																sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}
															>
																<Button
																	size="small"
																	variant="outlined"
																	onClick={() => setStatusUser(u)}
																>
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
																		Restablecer clave
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
								page={Math.min(page, Math.max(0, Math.ceil((list.data?.total ?? 0) / size) - 1))}
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
			)}
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
