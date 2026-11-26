import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import {
	Alert,
	Button,
	Chip,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Paper,
	Stack,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TablePagination,
	TableRow,
	Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
	cambiarEstadoPlantilla,
	getPlantillasCorreo,
	type PlantillaCorreo,
} from '#entities/plantilla-correo';
import { useAuth } from '#entities/session';
import { TemplateForm } from '#features/manage-email-template';
import { EmptyState, PageHeader } from '#shared/ui';
import { ComunicacionesTabs } from './ComunicacionesTabs';

const ESTADO_PILLS = [
	{ value: 'todos', label: 'Todas' },
	{ value: 'activo', label: 'Activas' },
	{ value: 'inactivo', label: 'Inactivas' },
] as const;

export function PlantillasPage() {
	const { cacheScope } = useAuth();
	return <Plantillas key={cacheScope} />;
}

function Plantillas() {
	const { perfil, profileStatus, isSigningOut, cacheScope } = useAuth(),
		client = useQueryClient();
	const [page, setPage] = useState(1),
		[size, setSize] = useState<20 | 50 | 100>(20),
		[estado, setEstado] = useState<'todos' | 'activo' | 'inactivo'>('todos'),
		[form, setForm] = useState<{ plantilla: PlantillaCorreo | null } | null>(null),
		[change, setChange] = useState<PlantillaCorreo | null>(null),
		[busy, setBusy] = useState(false),
		[error, setError] = useState<string | null>(null),
		[success, setSuccess] = useState('');
	const lockRef = useRef(false),
		abortRef = useRef<AbortController | null>(null),
		aliveRef = useRef(true);

	useEffect(() => {
		aliveRef.current = true;
		return () => {
			aliveRef.current = false;
			abortRef.current?.abort();
		};
	}, []);

	const q = useQuery({
		queryKey: ['plantillas-correo', cacheScope, page, size, estado],
		queryFn: ({ signal }) => getPlantillasCorreo(page, size, estado, perfil?.id ?? '', signal),
		enabled: profileStatus === 'ready' && !isSigningOut,
		retry: 1,
	});

	useEffect(() => {
		if (q.data) {
			const ultima = Math.max(1, Math.ceil(q.data.total / size));
			if (page > ultima) {
				setPage(ultima);
			}
		}
	}, [q.data, page, size]);

	const refresh = () => {
		void client.invalidateQueries({ queryKey: ['plantillas-correo', cacheScope] });
		void client.invalidateQueries({ queryKey: ['email-templates', cacheScope] });
	};

	const confirm = async () => {
		if (!change || lockRef.current || profileStatus !== 'ready' || isSigningOut) {
			return;
		}
		lockRef.current = true;
		setBusy(true);
		setError(null);
		const c = new AbortController();
		abortRef.current = c;
		try {
			await cambiarEstadoPlantilla(
				change.id,
				change.estado === 'activo' ? 'inactivo' : 'activo',
				perfil?.id ?? '',
				c.signal,
			);
			if (aliveRef.current) {
				setSuccess(
					change.estado === 'activo'
						? 'Plantilla desactivada. Los envíos históricos se conservan.'
						: 'Plantilla activada y disponible para futuras comunicaciones.',
				);
				setChange(null);
				refresh();
			}
		} catch (e) {
			if (aliveRef.current) {
				setError(e instanceof Error ? e.message : 'No se confirmó el cambio.');
				refresh();
			}
		} finally {
			if (aliveRef.current) {
				setBusy(false);
				lockRef.current = false;
			}
		}
	};

	return (
		<Stack spacing={3}>
			<PageHeader
				title="Plantillas de correo"
				subtitle="Prepará mensajes reutilizables con etiquetas dinámicas. Editar o desactivar una plantilla conserva los envíos anteriores."
				actions={
					<Button
						variant="contained"
						startIcon={<AddOutlinedIcon />}
						onClick={() => {
							setError(null);
							setSuccess('');
							setForm({ plantilla: null });
						}}
					>
						Nueva plantilla
					</Button>
				}
			/>

			<ComunicacionesTabs />

			<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
				<Stack spacing={2.25}>
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
									onClick={() => {
										setEstado(pill.value);
										setPage(1);
									}}
								/>
							);
						})}
					</Stack>

					{success && (
						<Alert severity="success" onClose={() => setSuccess('')}>
							{success}
						</Alert>
					)}
					{error && <Alert severity="error">{error}</Alert>}

					{q.isLoading ? (
						<Stack
							direction="row"
							spacing={1.5}
							sx={{ py: 5, justifyContent: 'center', alignItems: 'center' }}
						>
							<CircularProgress size={20} />
							<Typography variant="body2" color="text.secondary">
								Consultando plantillas…
							</Typography>
						</Stack>
					) : q.isError ? (
						<Alert
							severity="error"
							action={
								<Button size="small" color="inherit" onClick={() => void q.refetch()}>
									Reintentar
								</Button>
							}
						>
							{q.error.message}
						</Alert>
					) : q.data ? (
						!q.data.plantillas.length ? (
							<EmptyState
								icon={<DescriptionOutlinedIcon />}
								title={
									estado === 'todos'
										? 'Todavía no hay plantillas creadas'
										: 'No hay plantillas para este estado'
								}
								description={
									estado === 'todos'
										? 'Creá una plantilla para agilizar comunicados frecuentes del club.'
										: 'Probá seleccionando «Todas» para ver el resto.'
								}
								action={
									estado !== 'todos' ? (
										<Button
											variant="outlined"
											size="small"
											onClick={() => {
												setEstado('todos');
												setPage(1);
											}}
										>
											Ver todas
										</Button>
									) : (
										<Button
											variant="contained"
											size="small"
											startIcon={<AddOutlinedIcon />}
											onClick={() => {
												setError(null);
												setSuccess('');
												setForm({ plantilla: null });
											}}
										>
											Nueva plantilla
										</Button>
									)
								}
							/>
						) : (
							<>
								<TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
									<Table size="small" aria-label="Plantillas de correo" sx={{ minWidth: 640 }}>
										<TableHead>
											<TableRow>
												<TableCell>Nombre de la plantilla</TableCell>
												<TableCell>Asunto</TableCell>
												<TableCell>Estado</TableCell>
												<TableCell align="right">Acciones</TableCell>
											</TableRow>
										</TableHead>
										<TableBody>
											{q.data.plantillas.map((p) => (
												<TableRow key={p.id}>
													<TableCell sx={{ fontWeight: 600 }}>{p.nombre_interno}</TableCell>
													<TableCell>{p.asunto}</TableCell>
													<TableCell>
														<Chip
															size="small"
															label={p.estado === 'activo' ? 'Activa' : 'Inactiva'}
															color={p.estado === 'activo' ? 'success' : 'default'}
														/>
													</TableCell>
													<TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
														<Stack
															direction="row"
															spacing={0.5}
															sx={{ justifyContent: 'flex-end' }}
														>
															<Button
																size="small"
																variant="outlined"
																onClick={() => {
																	setError(null);
																	setSuccess('');
																	setForm({ plantilla: p });
																}}
															>
																Editar
															</Button>
															<Button
																size="small"
																color={p.estado === 'activo' ? 'error' : 'primary'}
																onClick={() => {
																	setError(null);
																	setChange(p);
																}}
															>
																{p.estado === 'activo' ? 'Desactivar' : 'Activar'}
															</Button>
														</Stack>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</TableContainer>
								<TablePagination
									component="div"
									count={q.data.total}
									page={Math.min(page - 1, Math.max(0, Math.ceil(q.data.total / size) - 1))}
									rowsPerPage={size}
									rowsPerPageOptions={[20, 50, 100]}
									labelRowsPerPage="Filas por página"
									labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
									onPageChange={(_, p) => setPage(p + 1)}
									onRowsPerPageChange={(e) => {
										setPage(1);
										setSize(Number(e.target.value) as 20 | 50 | 100);
									}}
								/>
							</>
						)
					) : null}
				</Stack>
			</Paper>

			{form && (
				<TemplateForm
					plantilla={form.plantilla}
					onClose={() => setForm(null)}
					onSaved={() => {
						setSuccess('Plantilla guardada correctamente.');
						refresh();
					}}
				/>
			)}

			<Dialog
				open={Boolean(change)}
				fullWidth
				maxWidth="sm"
				aria-labelledby="estado-plantilla-title"
				onClose={() => {
					if (!busy) {
						setChange(null);
					}
				}}
			>
				<DialogTitle id="estado-plantilla-title">
					{change?.estado === 'activo' ? 'Desactivar plantilla' : 'Activar plantilla'}
				</DialogTitle>
				<DialogContent dividers>
					<Stack spacing={2}>
						<Paper variant="outlined" sx={{ p: 1.75, bgcolor: 'action.hover' }}>
							<Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
								{change?.nombre_interno}
							</Typography>
							{change?.asunto && (
								<Typography variant="caption" color="text.secondary">
									Asunto: {change.asunto}
								</Typography>
							)}
						</Paper>
						<Typography variant="body2">
							{change?.estado === 'activo'
								? 'Dejará de aparecer al redactar nuevas comunicaciones. Los envíos anteriores conservan su asunto y mensaje.'
								: 'Volverá a estar disponible al redactar nuevas comunicaciones.'}
						</Typography>
						{error && <Alert severity="error">{error}</Alert>}
					</Stack>
				</DialogContent>
				<DialogActions>
					<Button disabled={busy} onClick={() => setChange(null)}>
						Cancelar
					</Button>
					<Button
						disabled={busy}
						variant="contained"
						color={change?.estado === 'activo' ? 'error' : 'primary'}
						startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
						onClick={() => void confirm()}
					>
						{busy ? 'Confirmando…' : 'Confirmar'}
					</Button>
				</DialogActions>
			</Dialog>
		</Stack>
	);
}
