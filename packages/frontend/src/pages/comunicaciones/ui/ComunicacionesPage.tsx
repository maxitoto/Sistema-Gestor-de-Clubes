import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import MailOutlineOutlinedIcon from '@mui/icons-material/MailOutlineOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import {
	Alert,
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
	TablePagination,
	TableRow,
	TableSortLabel,
	TextField,
	Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
	type CriteriosHistorial,
	criteriosHistorialIniciales,
	type EnvioCorreo,
	getHistorialCorreo,
	getReporteCorreos,
} from '#entities/comunicacion';
import { useAuth } from '#entities/session';
import { type ColumnaExportacion, ExportGridButton } from '#features/export-grid';
import { fechaCorreo, rangoDiasCorreo } from '#shared/lib/comunicaciones';
import { DateRangePresets, EmptyState, InfoTooltip, PageHeader } from '#shared/ui';
import { ComunicacionesTabs } from './ComunicacionesTabs';

const ESTADO_PILLS: readonly { value: CriteriosHistorial['estado']; label: string }[] = [
	{ value: 'todos', label: 'Todos' },
	{ value: 'procesando', label: 'Procesando' },
	{ value: 'enviado', label: 'Aceptados' },
	{ value: 'fallido', label: 'Con fallos' },
];

const columnasExportacionCorreos: ColumnaExportacion<EnvioCorreo>[] = [
	{ titulo: 'Fecha y hora del club', tipo: 'texto', valor: (e) => fechaCorreo(e.fecha_envio) },
	{ titulo: 'Asunto', tipo: 'texto', valor: (e) => e.asunto },
	{
		titulo: 'Tipo',
		tipo: 'texto',
		valor: (e) =>
			e.tipo === 'general'
				? 'Comunicación general'
				: e.tipo === 'deuda'
					? 'Aviso de deuda'
					: 'Notificación de operación',
	},
	{
		titulo: 'Origen',
		tipo: 'texto',
		valor: (e) => (e.origen === 'automatico' ? 'Automático' : 'Manual'),
	},
	{
		titulo: 'Autor',
		tipo: 'texto',
		valor: (e) =>
			e.origen === 'automatico' ? 'Automático' : (e.autor_nombre ?? 'Autor no disponible'),
	},
	{ titulo: 'Destinatarios', tipo: 'numero', valor: (e) => e.destinatarios_count },
	{
		titulo: 'Estado del envío',
		tipo: 'texto',
		valor: (e) =>
			e.estado === 'enviado'
				? 'Aceptado por proveedor'
				: e.estado === 'fallido'
					? 'Con fallos'
					: 'Procesando',
	},
];

export function ComunicacionesPage() {
	const { cacheScope } = useAuth();
	return <Historial key={cacheScope} />;
}

function Historial() {
	const { perfil, cacheScope, profileStatus, isSigningOut } = useAuth();
	const [searchParams, setSearchParams] = useSearchParams();
	const desdeUrl = searchParams.get('desde') ?? '',
		hastaUrl = searchParams.get('hasta') ?? '';
	const [c, setC] = useState<CriteriosHistorial>(() => ({
		...criteriosHistorialIniciales,
		desde: desdeUrl,
		hasta: hastaUrl,
	}));

	useEffect(() => {
		setC((x) => ({ ...x, desde: desdeUrl, hasta: hastaUrl, page: 1 }));
	}, [desdeUrl, hastaUrl]);

	const startRef = useRef(Date.now());
	useEffect(() => {
		startRef.current = Date.now();
	}, []);

	let issue: string | null = null;
	try {
		rangoDiasCorreo(c.desde, c.hasta);
	} catch (e) {
		issue = e instanceof Error ? e.message : 'Revisá el período.';
	}

	const q = useQuery({
		queryKey: ['comunicaciones-historial', cacheScope, c],
		queryFn: ({ signal }) => getHistorialCorreo(c, perfil?.id ?? '', signal),
		enabled: profileStatus === 'ready' && !isSigningOut && !issue,
		retry: 1,
		refetchInterval: (query) =>
			Date.now() - startRef.current < 120000 &&
			query.state.data?.envios.some((x) => x.estado === 'procesando')
				? 10000
				: false,
		refetchIntervalInBackground: false,
	});

	useEffect(() => {
		if (q.data) {
			const ultima = Math.max(1, Math.ceil(q.data.total / c.pageSize));
			if (c.page > ultima) {
				setC((x) => ({ ...x, page: ultima }));
			}
		}
	}, [q.data, c.page, c.pageSize]);

	const sort = (sortBy: CriteriosHistorial['sortBy']) =>
		setC((x) => ({
			...x,
			page: 1,
			sortBy,
			sortOrder: x.sortBy === sortBy && x.sortOrder === 'desc' ? 'asc' : 'desc',
		}));

	const clearFilters = () => {
		setC({ ...criteriosHistorialIniciales });
		if (searchParams.has('desde') || searchParams.has('hasta')) {
			const next = new URLSearchParams(searchParams);
			next.delete('desde');
			next.delete('hasta');
			setSearchParams(next, { replace: true });
		}
	};

	const hasAnyFilter = Boolean(c.desde || c.hasta) || c.estado !== 'todos';

	return (
		<Stack spacing={3}>
			<PageHeader
				title="Comunicaciones"
				subtitle="Consultá el historial de envíos, redactá avisos a socios y administrá plantillas."
				actions={
					<Button
						variant="contained"
						component={Link}
						to="/comunicaciones/redactar"
						startIcon={<EditNoteOutlinedIcon />}
					>
						Redactar comunicación
					</Button>
				}
			/>

			<ComunicacionesTabs />

			<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
				<Stack spacing={2.25}>
					<Stack
						direction={{ xs: 'column', md: 'row' }}
						spacing={1.5}
						sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}
					>
						<Stack
							direction="row"
							spacing={0.75}
							useFlexGap
							sx={{ flexWrap: 'wrap', alignItems: 'center' }}
						>
							{ESTADO_PILLS.map((pill) => {
								const active = c.estado === pill.value;
								return (
									<Chip
										key={pill.value}
										size="small"
										label={pill.label}
										clickable
										color={active ? 'primary' : 'default'}
										variant={active ? 'filled' : 'outlined'}
										onClick={() => setC({ ...c, estado: pill.value, page: 1 })}
									/>
								);
							})}
						</Stack>

						<Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
							{hasAnyFilter && (
								<Button size="small" color="inherit" onClick={clearFilters}>
									Limpiar filtros
								</Button>
							)}
							<Button
								size="small"
								variant="outlined"
								startIcon={<RefreshOutlinedIcon />}
								onClick={() => {
									startRef.current = Date.now();
									void q.refetch();
								}}
								disabled={q.isFetching || Boolean(issue)}
							>
								Actualizar
							</Button>
						</Stack>
					</Stack>

					<Stack
						direction={{ xs: 'column', lg: 'row' }}
						spacing={1.5}
						sx={{
							p: 2,
							borderRadius: 1.5,
							bgcolor: 'action.hover',
							border: 1,
							borderColor: 'divider',
							alignItems: { lg: 'center' },
							justifyContent: 'space-between',
						}}
					>
						<DateRangePresets
							label="Fecha de envío"
							desde={c.desde}
							hasta={c.hasta}
							onSelect={({ desde, hasta }) => setC({ ...c, desde, hasta, page: 1 })}
						/>
						<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
							<TextField
								size="small"
								type="date"
								label="Desde"
								value={c.desde}
								slotProps={{ inputLabel: { shrink: true } }}
								onChange={(e) => setC({ ...c, desde: e.target.value, page: 1 })}
							/>
							<TextField
								size="small"
								type="date"
								label="Hasta"
								value={c.hasta}
								slotProps={{ inputLabel: { shrink: true } }}
								onChange={(e) => setC({ ...c, hasta: e.target.value, page: 1 })}
							/>
						</Stack>
					</Stack>

					<Stack
						direction={{ xs: 'column', sm: 'row' }}
						spacing={1.5}
						sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
					>
						<Typography variant="body2" color="text.secondary">
							{q.data
								? `${q.data.total} ${q.data.total === 1 ? 'envío registrado' : 'envíos registrados'}.`
								: 'Consultando envíos…'}
						</Typography>
						<ExportGridButton
							nombreArchivo="correos"
							filtroSnapshot={c}
							orden={{ campo: c.sortBy, direccion: c.sortOrder }}
							columnas={columnasExportacionCorreos}
							claveFila={(e) => e.id}
							disabled={
								profileStatus !== 'ready' || isSigningOut || !!issue || q.isLoading || q.isError
							}
							obtenerPagina={async (p) => {
								const resultado = await getReporteCorreos(
									{
										...p.filtro,
										sortBy: p.orden.campo as CriteriosHistorial['sortBy'],
										sortOrder: p.orden.direccion,
									},
									perfil?.id ?? '',
									p.signal,
									{
										pagina: p.pagina - 1,
										limite: p.tamanoPagina,
										...(p.version ? { revision: p.version } : {}),
										exportar: true,
									},
								);
								return {
									filas: resultado.filas,
									total: resultado.total,
									version: resultado.revision,
								};
							}}
						/>
					</Stack>

					{issue && <Alert severity="warning">{issue}</Alert>}

					{q.isLoading ? (
						<Stack
							direction="row"
							spacing={1.5}
							sx={{ py: 5, justifyContent: 'center', alignItems: 'center' }}
						>
							<CircularProgress size={20} />
							<Typography variant="body2" color="text.secondary">
								Consultando envíos…
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
						q.data.envios.length === 0 ? (
							<EmptyState
								icon={<MailOutlineOutlinedIcon />}
								title={
									hasAnyFilter
										? 'No encontramos envíos con estos filtros'
										: 'Todavía no hay comunicaciones enviadas'
								}
								description={
									hasAnyFilter
										? 'Probá ampliando el rango de fechas o cambiando el estado seleccionado.'
										: 'Cuando envíes una comunicación general o un aviso de deuda, el historial aparecerá acá.'
								}
								action={
									hasAnyFilter ? (
										<Button variant="outlined" size="small" onClick={clearFilters}>
											Limpiar filtros
										</Button>
									) : (
										<Button
											variant="contained"
											size="small"
											component={Link}
											to="/comunicaciones/redactar"
										>
											Redactar comunicación
										</Button>
									)
								}
							/>
						) : (
							<>
								<TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
									<Table
										size="small"
										aria-label="Historial de comunicaciones"
										sx={{ minWidth: 740 }}
									>
										<TableHead>
											<TableRow>
												<TableCell>
													<TableSortLabel
														active={c.sortBy === 'fecha_envio'}
														direction={c.sortBy === 'fecha_envio' ? c.sortOrder : 'asc'}
														onClick={() => sort('fecha_envio')}
													>
														Fecha y hora
													</TableSortLabel>
												</TableCell>
												<TableCell>
													<TableSortLabel
														active={c.sortBy === 'asunto'}
														direction={c.sortBy === 'asunto' ? c.sortOrder : 'asc'}
														onClick={() => sort('asunto')}
													>
														Asunto
													</TableSortLabel>
												</TableCell>
												<TableCell>Origen y autor</TableCell>
												<TableCell align="right">
													<TableSortLabel
														active={c.sortBy === 'destinatarios_count'}
														direction={c.sortBy === 'destinatarios_count' ? c.sortOrder : 'asc'}
														onClick={() => sort('destinatarios_count')}
													>
														Destinatarios
													</TableSortLabel>
												</TableCell>
												<TableCell>
													<Stack direction="row" spacing={0.25} sx={{ alignItems: 'center' }}>
														<TableSortLabel
															active={c.sortBy === 'estado'}
															direction={c.sortBy === 'estado' ? c.sortOrder : 'asc'}
															onClick={() => sort('estado')}
														>
															Estado
														</TableSortLabel>
														<InfoTooltip
															label="Diferencia entre aceptación y entrega"
															title="Aceptado por proveedor indica que el envío salió hacia el servidor de correo. Abrí el detalle para ver la confirmación individual de entrega en cada casilla."
														/>
													</Stack>
												</TableCell>
												<TableCell align="right">Acciones</TableCell>
											</TableRow>
										</TableHead>
										<TableBody>
											{q.data.envios.map((envio) => (
												<TableRow key={envio.id}>
													<TableCell
														sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
													>
														{fechaCorreo(envio.fecha_envio)}
													</TableCell>
													<TableCell>
														<Typography variant="body2" sx={{ fontWeight: 600 }}>
															{envio.asunto}
														</Typography>
														<Typography variant="caption" color="text.secondary">
															{envio.tipo === 'general'
																? 'Comunicación general'
																: envio.tipo === 'deuda'
																	? 'Aviso de deuda'
																	: 'Notificación de operación'}
														</Typography>
													</TableCell>
													<TableCell>
														{envio.origen === 'automatico'
															? 'Automático'
															: (envio.autor_nombre ?? 'Autor no disponible')}
													</TableCell>
													<TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
														{envio.destinatarios_count}
													</TableCell>
													<TableCell sx={{ whiteSpace: 'nowrap' }}>
														<Chip
															size="small"
															color={
																envio.estado === 'fallido'
																	? 'error'
																	: envio.estado === 'procesando'
																		? 'warning'
																		: 'success'
															}
															label={
																envio.estado === 'enviado'
																	? 'Aceptado por proveedor'
																	: envio.estado === 'fallido'
																		? 'Con fallos'
																		: 'Procesando'
															}
														/>
													</TableCell>
													<TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
														<Button
															size="small"
															variant="outlined"
															component={Link}
															to={`/comunicaciones/${envio.id}`}
														>
															Ver detalle
														</Button>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</TableContainer>
								<TablePagination
									component="div"
									count={q.data.total}
									page={Math.min(c.page - 1, Math.max(0, Math.ceil(q.data.total / c.pageSize) - 1))}
									rowsPerPage={c.pageSize}
									rowsPerPageOptions={[20, 50, 100]}
									labelRowsPerPage="Filas por página"
									labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
									onPageChange={(_, page) => setC({ ...c, page: page + 1 })}
									onRowsPerPageChange={(e) =>
										setC({ ...c, page: 1, pageSize: Number(e.target.value) as 20 | 50 | 100 })
									}
								/>
							</>
						)
					) : null}
				</Stack>
			</Paper>
		</Stack>
	);
}
