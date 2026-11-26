import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import {
	Alert,
	Box,
	Button,
	Checkbox,
	Chip,
	CircularProgress,
	FormControlLabel,
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
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCategorias } from '#entities/categoria';
import {
	type CandidatoCorreo,
	type CriteriosCandidatos,
	criteriosCandidatosIniciales,
	getCandidatosCorreo,
} from '#entities/comunicacion';
import { useDeportes } from '#entities/deporte';
import { useAuth } from '#entities/session';
import { SendEmailPanel } from '#features/send-email';
import { monedaCobranza } from '#shared/types/cobranza';
import { EmptyState, PageHeader } from '#shared/ui';
import { ComunicacionesTabs } from './ComunicacionesTabs';

export function RedactarComunicacionPage() {
	const { cacheScope } = useAuth();
	return <Redactar key={cacheScope} />;
}

function Redactar() {
	const { perfil, cacheScope, profileStatus, isSigningOut } = useAuth(),
		actor = perfil?.id ?? '';
	const [c, setC] = useState<CriteriosCandidatos>(criteriosCandidatosIniciales),
		[search, setSearch] = useState(''),
		[selected, setSelected] = useState<Record<string, CandidatoCorreo>>({}),
		[full, setFull] = useState<{ ids: string[]; elegibles: number; excluidos: number } | null>(
			null,
		),
		[busy, setBusy] = useState(false),
		[allBusy, setAllBusy] = useState(false),
		[error, setError] = useState<string | null>(null);
	const aliveRef = useRef(true),
		allAbortRef = useRef<AbortController | null>(null);

	useEffect(() => {
		aliveRef.current = true;
		return () => {
			aliveRef.current = false;
			allAbortRef.current?.abort();
		};
	}, []);

	const clear = useCallback(() => {
			setSelected({});
			setFull(null);
		}, []),
		onPending = useCallback((v: boolean) => setBusy(v), []);

	const update = (next: Partial<CriteriosCandidatos>) => {
		clear();
		setError(null);
		allAbortRef.current?.abort();
		setAllBusy(false);
		setC((x) => ({ ...x, ...next, page: 1 }));
	};

	useEffect(() => {
		const t = setTimeout(() => {
			setC((x) => ({ ...x, busqueda: search, page: 1 }));
			setSelected({});
			setFull(null);
		}, 300);
		return () => clearTimeout(t);
	}, [search]);

	const enabled = profileStatus === 'ready' && !isSigningOut;
	const q = useQuery({
		queryKey: ['comunicaciones-candidatos', cacheScope, c],
		queryFn: ({ signal }) => getCandidatosCorreo(c, actor, false, signal),
		enabled,
		retry: 1,
		refetchOnWindowFocus: false,
	});

	useEffect(() => {
		if (q.data) {
			const ultima = Math.max(1, Math.ceil(q.data.total / c.pageSize));
			if (c.page > ultima) {
				setC((x) => ({ ...x, page: ultima }));
			}
		}
	}, [q.data, c.page, c.pageSize]);

	const deportes = useDeportes({ cacheScope, enabled, soloActivos: false }),
		categorias = useCategorias(c.deporteId || null, { cacheScope, enabled, soloActivas: false });
	const pending = busy || allBusy || q.isFetching || search !== c.busqueda;
	const rows = Object.values(selected),
		ids = full?.ids ?? Object.keys(selected),
		elegibles = full?.elegibles ?? rows.filter((x) => x.elegible).length,
		excluidos = full?.excluidos ?? rows.filter((x) => !x.elegible).length;

	const all = async () => {
		if (pending) {
			return;
		}
		setAllBusy(true);
		setError(null);
		const abort = new AbortController();
		allAbortRef.current = abort;
		try {
			const result = await getCandidatosCorreo(c, actor, true, abort.signal);
			if (aliveRef.current && !abort.signal.aborted) {
				setFull({
					ids: result.idsFiltrados ?? [],
					elegibles: result.elegibles,
					excluidos: result.excluidos,
				});
				setSelected({});
			}
		} catch (e) {
			if (aliveRef.current && !abort.signal.aborted) {
				setError(e instanceof Error ? e.message : 'No se obtuvo la selección completa.');
			}
		} finally {
			if (aliveRef.current && !abort.signal.aborted) {
				setAllBusy(false);
			}
		}
	};

	const toggle = (row: CandidatoCorreo) => {
		if (pending || full) {
			return;
		}
		if (!selected[row.id] && Object.keys(selected).length >= 1000) {
			setError('El límite es de 1000 socios por envío.');
			return;
		}
		setSelected((prev) => {
			const next = { ...prev };
			if (next[row.id]) {
				delete next[row.id];
			} else if (Object.keys(next).length < 1000) {
				next[row.id] = row;
			}
			return next;
		});
	};

	const page = () => {
		if (!q.data || pending) {
			return;
		}
		const next = { ...selected };
		for (const row of q.data.candidatos) {
			next[row.id] = row;
		}
		if (Object.keys(next).length > 1000) {
			setError('La selección supera el límite de 1000 socios.');
			return;
		}
		setFull(null);
		setSelected(next);
	};

	return (
		<Stack spacing={3}>
			<PageHeader
				title="Redactar comunicación"
				subtitle="Elegí primero los destinatarios y luego redactá el mensaje con vista previa."
			/>

			<ComunicacionesTabs />

			<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
				<Stack spacing={2.25}>
					<Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
						<Chip size="small" color="primary" label="Paso 1" />
						<Typography component="h2" variant="h6">
							Destinatarios y tipo de envío
						</Typography>
					</Stack>

					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: {
								xs: '1fr',
								sm: 'repeat(2, minmax(0, 1fr))',
								lg: 'repeat(5, minmax(0, 1fr))',
							},
							gap: 1.5,
						}}
					>
						<TextField
							size="small"
							select
							label="Tipo de comunicación"
							value={c.tipo}
							disabled={busy}
							onChange={(e) =>
								update({
									tipo: e.target.value === 'deuda' ? 'deuda' : 'general',
									incluirDesuscriptos: false,
								})
							}
						>
							<MenuItem value="general">Comunicación general</MenuItem>
							<MenuItem value="deuda">Aviso de deuda</MenuItem>
						</TextField>

						<TextField
							size="small"
							select
							label="Deporte"
							value={c.deporteId}
							disabled={busy || deportes.isLoading}
							onChange={(e) => update({ deporteId: e.target.value, categoriaId: '' })}
						>
							<MenuItem value="">Todos los deportes</MenuItem>
							{deportes.data?.map((d) => (
								<MenuItem key={d.id} value={d.id}>
									{d.nombre}
									{d.estado === 'inactivo' ? ' (inactivo)' : ''}
								</MenuItem>
							))}
						</TextField>

						<TextField
							size="small"
							select
							label="Categoría"
							value={c.categoriaId}
							disabled={busy || !c.deporteId || categorias.isLoading}
							onChange={(e) => update({ categoriaId: e.target.value })}
						>
							<MenuItem value="">Todas las categorías</MenuItem>
							{categorias.data?.map((d) => (
								<MenuItem key={d.id} value={d.id}>
									{d.nombre}
									{d.estado === 'inactivo' ? ' (inactiva)' : ''}
								</MenuItem>
							))}
						</TextField>

						<TextField
							size="small"
							select
							label="Estado de pago"
							value={c.estadoPago}
							disabled={busy}
							onChange={(e) =>
								update({ estadoPago: e.target.value as CriteriosCandidatos['estadoPago'] })
							}
						>
							<MenuItem value="todos">Todos</MenuItem>
							<MenuItem value="moroso">Con mora (+30 días)</MenuItem>
							<MenuItem value="aldia">Al día</MenuItem>
						</TextField>

						<TextField
							size="small"
							label="Buscar socio"
							placeholder="Apellido, DNI o correo…"
							value={search}
							disabled={busy}
							onChange={(e) => {
								clear();
								setSearch(e.target.value);
							}}
							slotProps={{
								input: {
									startAdornment: (
										<InputAdornment position="start">
											<SearchOutlinedIcon fontSize="small" color="action" />
										</InputAdornment>
									),
								},
							}}
						/>
					</Box>

					{(deportes.isError || categorias.isError) && (
						<Alert severity="warning">
							No pudimos cargar parte del catálogo. Podés consultar todos los socios o reintentar.
						</Alert>
					)}

					{c.tipo === 'deuda' && (
						<FormControlLabel
							control={
								<Checkbox
									checked={c.incluirDesuscriptos}
									disabled={busy}
									onChange={(e) => update({ incluirDesuscriptos: e.target.checked })}
								/>
							}
							label="Incluir desuscriptos solo para avisar sobre deuda pendiente"
						/>
					)}

					<Typography variant="caption" color="text.secondary">
						Las comunicaciones generales requieren socio activo, correo válido y suscripción activa.
						Los avisos de deuda también incluyen inactivos con saldo pendiente.
					</Typography>

					{error && <Alert severity="warning">{error}</Alert>}

					{q.isLoading ? (
						<Stack
							direction="row"
							spacing={1.5}
							sx={{ py: 4, justifyContent: 'center', alignItems: 'center' }}
						>
							<CircularProgress size={20} />
							<Typography variant="body2" color="text.secondary">
								Calculando candidatos…
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
						<>
							<Stack
								direction={{ xs: 'column', md: 'row' }}
								spacing={1.5}
								sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}
							>
								<Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
									<Chip size="small" label={`${q.data.total} candidatos`} />
									<Chip size="small" color="success" label={`${q.data.elegibles} elegibles`} />
									<Chip size="small" color="default" label={`${q.data.excluidos} excluidos`} />
								</Stack>
								<Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
									<Button
										size="small"
										variant="outlined"
										disabled={pending || Boolean(full) || !q.data.candidatos.length}
										onClick={page}
									>
										Seleccionar esta página
									</Button>
									<Button
										size="small"
										variant="outlined"
										disabled={pending || q.data.total === 0 || q.data.total > 1000}
										onClick={() => void all()}
									>
										{allBusy ? 'Seleccionando…' : 'Seleccionar todos los filtrados'}
									</Button>
									{ids.length > 0 && (
										<Button size="small" color="inherit" disabled={busy} onClick={clear}>
											Limpiar selección
										</Button>
									)}
								</Stack>
							</Stack>

							{q.data.total > 1000 && (
								<Alert severity="info">
									Hay más de 1000 candidatos. Acotá los filtros o seleccioná hasta 1000 socios por
									envío.
								</Alert>
							)}
							{full && (
								<Alert severity="info">
									Seleccionaste los {full.ids.length} socios del filtro actual (incluidas sus
									exclusiones). Para elegir individualmente, limpiá la selección.
								</Alert>
							)}

							{!q.data.candidatos.length ? (
								<EmptyState
									title="No hay socios que coincidan con estos criterios"
									description="Probá ampliando los filtros de deporte, estado de pago o búsqueda."
								/>
							) : (
								<>
									<TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
										<Table
											size="small"
											aria-label="Candidatos de comunicación"
											sx={{ minWidth: 780 }}
										>
											<TableHead>
												<TableRow>
													<TableCell sx={{ width: 56 }}>Sel.</TableCell>
													<TableCell>Socio</TableCell>
													<TableCell>Correo</TableCell>
													<TableCell>Actividad</TableCell>
													<TableCell align="right">Deuda pendiente</TableCell>
													<TableCell>Elegibilidad</TableCell>
												</TableRow>
											</TableHead>
											<TableBody>
												{q.data.candidatos.map((row) => (
													<TableRow key={row.id}>
														<TableCell>
															<Checkbox
																size="small"
																checked={
																	full ? full.ids.includes(row.id) : Boolean(selected[row.id])
																}
																disabled={pending || Boolean(full)}
																onChange={() => toggle(row)}
																slotProps={{
																	input: {
																		'aria-label': `Seleccionar a ${row.apellido}, ${row.nombre}, DNI ${row.dni}`,
																	},
																}}
															/>
														</TableCell>
														<TableCell>
															<Typography variant="body2" sx={{ fontWeight: 600 }}>
																{row.apellido}, {row.nombre}
															</Typography>
															<Typography
																variant="caption"
																color="text.secondary"
																sx={{ fontVariantNumeric: 'tabular-nums' }}
															>
																DNI {row.dni}
																{row.estado === 'inactivo' ? ' · Inactivo' : ''}
															</Typography>
														</TableCell>
														<TableCell>
															<Typography variant="body2">{row.email ?? 'Sin correo'}</Typography>
															<Typography
																variant="caption"
																color={row.email_invalido ? 'error.main' : 'text.secondary'}
																sx={{ display: 'block' }}
															>
																{row.email_invalido
																	? 'Dirección inválida'
																	: row.acepta_comunicaciones
																		? 'Suscripto'
																		: 'Desuscripto'}
															</Typography>
														</TableCell>
														<TableCell>{row.deportes || 'Sin actividad vigente'}</TableCell>
														<TableCell
															align="right"
															sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
														>
															{monedaCobranza(row.deuda_pendiente)}
														</TableCell>
														<TableCell>
															<Chip
																size="small"
																color={row.elegible ? 'success' : 'default'}
																label={row.elegible ? 'Elegible' : 'Excluido'}
															/>
															{row.motivo && (
																<Typography
																	variant="caption"
																	color="text.secondary"
																	sx={{ display: 'block', mt: 0.25 }}
																>
																	{row.motivo}
																</Typography>
															)}
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</TableContainer>
									<TablePagination
										component="div"
										count={q.data.total}
										page={Math.min(
											c.page - 1,
											Math.max(0, Math.ceil(q.data.total / c.pageSize) - 1),
										)}
										rowsPerPage={c.pageSize}
										rowsPerPageOptions={[20, 50, 100]}
										labelRowsPerPage="Candidatos por página"
										labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
										onPageChange={(_, p) => {
											if (!busy) {
												setC({ ...c, page: p + 1 });
											}
										}}
										onRowsPerPageChange={(e) => {
											if (!busy) {
												setC({ ...c, page: 1, pageSize: Number(e.target.value) as 20 | 50 | 100 });
											}
										}}
									/>
								</>
							)}
						</>
					) : null}

					<Box
						sx={{
							p: 1.5,
							borderRadius: 1.5,
							bgcolor: 'action.hover',
							border: 1,
							borderColor: 'divider',
						}}
					>
						<Typography variant="body2" sx={{ fontWeight: 600 }}>
							Selección actual: {ids.length} {ids.length === 1 ? 'socio' : 'socios'} · {elegibles}{' '}
							elegibles · {excluidos} excluidos
						</Typography>
					</Box>
				</Stack>
			</Paper>

			<SendEmailPanel
				tipo={c.tipo}
				incluirDesuscriptos={c.incluirDesuscriptos}
				selectedSocios={ids}
				selectedLabels={
					full
						? ['Todos los socios de los filtros confirmados.']
						: rows.map((x) => `${x.apellido}, ${x.nombre} · ${x.email ?? 'Sin correo'}`)
				}
				elegibles={elegibles}
				excluidos={excluidos}
				onClearSelection={clear}
				onPendingChange={onPending}
				disabled={allBusy || q.isFetching || q.isError || search !== c.busqueda}
			/>
		</Stack>
	);
}
