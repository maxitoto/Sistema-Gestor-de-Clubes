import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import {
	Alert,
	Box,
	Button,
	Chip,
	CircularProgress,
	Paper,
	Stack,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Typography,
} from '@mui/material';
import { useState } from 'react';
import { type CategoriaGasto, useCategoriasGasto } from '#entities/categoria-gasto';
import { useAuth } from '#entities/session';
import { EmptyState } from '#shared/ui';
import { BajaCategoriaGastoDialog } from './BajaCategoriaGastoDialog';
import { CategoriaGastoDialog } from './CategoriaGastoDialog';

const ESTADO_PILLS = [
	{ value: 'todos', label: 'Todas' },
	{ value: 'activo', label: 'Activas' },
	{ value: 'inactivo', label: 'Inactivas' },
] as const;

export function CategoriasGastoPanel() {
	const { cacheScope } = useAuth();
	return <Panel key={cacheScope} />;
}

function Panel() {
	const { cacheScope, perfil, profileStatus, isSigningOut } = useAuth();
	const enabled = profileStatus === 'ready' && perfil?.rol === 'admin' && !isSigningOut;
	const query = useCategoriasGasto({ cacheScope, enabled });
	const [estado, setEstado] = useState<'todos' | 'activo' | 'inactivo'>('todos');
	const [edit, setEdit] = useState<{ categoria: CategoriaGasto | null } | null>(null);
	const [baja, setBaja] = useState<CategoriaGasto | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	const saved = (message = 'Categoría guardada.') => {
		setEdit(null);
		setBaja(null);
		setNotice(message);
		void query.refetch();
	};

	if (!enabled) {
		return (
			<Alert severity="warning">La gestión de categorías está reservada al Administrador.</Alert>
		);
	}

	const filtered = query.data?.filter((c) => estado === 'todos' || c.estado === estado) ?? [];

	return (
		<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
			<Stack spacing={2.25}>
				{notice && (
					<Alert severity="success" onClose={() => setNotice(null)}>
						{notice}
					</Alert>
				)}

				<Stack
					direction={{ xs: 'column', sm: 'row' }}
					spacing={2}
					sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
				>
					<Box>
						<Typography variant="h6" component="h2">
							Categorías de gasto
						</Typography>
						<Typography variant="body2" color="text.secondary">
							Clasificá los egresos del club conservando siempre sus referencias históricas.
						</Typography>
					</Box>
					<Button
						variant="contained"
						startIcon={<AddOutlinedIcon />}
						onClick={() => setEdit({ categoria: null })}
						sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, flexShrink: 0 }}
					>
						Nueva categoría
					</Button>
				</Stack>

				<Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
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
								onClick={() => setEstado(pill.value)}
							/>
						);
					})}
				</Stack>

				{query.isPending ? (
					<Stack
						direction="row"
						spacing={1.5}
						sx={{ py: 5, justifyContent: 'center', alignItems: 'center' }}
					>
						<CircularProgress size={20} />
						<Typography variant="body2" color="text.secondary">
							Cargando categorías…
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
						No pudimos cargar las categorías de gasto.
					</Alert>
				) : filtered.length === 0 ? (
					<EmptyState
						title={
							estado === 'todos'
								? 'Todavía no hay categorías creadas'
								: 'No hay categorías con este estado'
						}
						description={
							estado === 'todos'
								? 'Creá la primera categoría (por ejemplo: Servicios, Mantenimiento o Equipamiento).'
								: 'Probá cambiando el filtro a «Todas».'
						}
						action={
							estado !== 'todos' ? (
								<Button variant="outlined" size="small" onClick={() => setEstado('todos')}>
									Ver todas
								</Button>
							) : (
								<Button
									variant="contained"
									size="small"
									startIcon={<AddOutlinedIcon />}
									onClick={() => setEdit({ categoria: null })}
								>
									Nueva categoría
								</Button>
							)
						}
					/>
				) : (
					<TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
						<Table size="small" aria-label="Categorías de gasto">
							<TableHead>
								<TableRow>
									<TableCell>Categoría</TableCell>
									<TableCell>Descripción</TableCell>
									<TableCell>Estado</TableCell>
									<TableCell align="right">Acciones</TableCell>
								</TableRow>
							</TableHead>
							<TableBody>
								{filtered.map((c) => (
									<TableRow key={c.id}>
										<TableCell sx={{ fontWeight: 600 }}>{c.nombre}</TableCell>
										<TableCell>{c.descripcion ?? '—'}</TableCell>
										<TableCell>
											<Chip
												size="small"
												color={c.estado === 'activo' ? 'success' : 'default'}
												label={c.estado === 'activo' ? 'Activa' : 'Inactiva'}
											/>
										</TableCell>
										<TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
											<Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
												<Button
													size="small"
													variant="outlined"
													onClick={() => setEdit({ categoria: c })}
												>
													Editar
												</Button>
												{c.estado === 'activo' && (
													<Button size="small" color="error" onClick={() => setBaja(c)}>
														Dar de baja
													</Button>
												)}
											</Stack>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</TableContainer>
				)}

				{edit && (
					<CategoriaGastoDialog
						categoria={edit.categoria}
						onClose={() => setEdit(null)}
						onSaved={() => saved('Categoría guardada.')}
					/>
				)}
				{baja && (
					<BajaCategoriaGastoDialog
						categoria={baja}
						onClose={() => setBaja(null)}
						onSaved={() => saved('Categoría dada de baja.')}
					/>
				)}
			</Stack>
		</Paper>
	);
}
