import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import FilterListOutlinedIcon from '@mui/icons-material/FilterListOutlined';
import ReceiptOutlinedIcon from '@mui/icons-material/ReceiptOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import {
	Alert,
	Box,
	Button,
	Chip,
	CircularProgress,
	Collapse,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Divider,
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
	TableSortLabel,
	TextField,
	Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCategoriasGasto } from '#entities/categoria-gasto';
import {
	type FiltrosGasto,
	type Gasto,
	getFechaClubGastos,
	getGasto,
	getGastos,
	getReporteGastos,
	mensajeAltaGasto,
	monedaGasto,
	puedeAnularGasto,
	puedeEditarGasto,
} from '#entities/gasto';
import { useAuth } from '#entities/session';
import { AnularGastoDialog } from '#features/anular-gasto';
import { CreateGastoDialog } from '#features/create-gasto';
import { EditGastoDialog } from '#features/edit-gasto';
import { type ColumnaExportacion, ExportGridButton } from '#features/export-grid';
import { GastoEvidencia } from '#features/gasto-evidencia';
import { rangoDiasCorreo } from '#shared/lib/comunicaciones';
import { DateRangePresets, EmptyState } from '#shared/ui';

const ESTADO_PILLS = [
	{ value: 'todos', label: 'Todos' },
	{ value: 'activo', label: 'Activos' },
	{ value: 'anulado', label: 'Anulados' },
] as const;

const initial: FiltrosGasto = {
	desde: '',
	hasta: '',
	categoriaId: '',
	metodo: 'todos',
	estado: 'todos',
	busqueda: '',
	orden: 'fecha',
	ascendente: false,
	pagina: 0,
	limite: 20,
};

const formatoFechaGasto = new Intl.DateTimeFormat('es-AR', {
	dateStyle: 'short',
	timeZone: 'America/Argentina/Buenos_Aires',
});
const formatoInstanteGasto = new Intl.DateTimeFormat('es-AR', {
	dateStyle: 'short',
	timeStyle: 'short',
	timeZone: 'America/Argentina/Buenos_Aires',
});
const fechaVisible = (date: string) => formatoFechaGasto.format(new Date(`${date}T12:00:00Z`));
const instante = (date: string) => formatoInstanteGasto.format(new Date(date));

const columnasExportacionGastos: ColumnaExportacion<Gasto>[] = [
	{ titulo: 'Fecha del gasto', tipo: 'texto', valor: (g) => fechaVisible(g.fecha) },
	{
		titulo: 'Categoría',
		tipo: 'texto',
		valor: (g) => g.categoria?.nombre ?? 'Categoría no disponible',
	},
	{ titulo: 'Concepto', tipo: 'texto', valor: (g) => g.concepto },
	{ titulo: 'Descripción', tipo: 'texto', valor: (g) => g.descripcion },
	{ titulo: 'Importe', tipo: 'numero', valor: (g) => g.monto },
	{
		titulo: 'Medio de pago',
		tipo: 'texto',
		valor: (g) => (g.metodo_pago === 'efectivo' ? 'Efectivo' : 'Transferencia'),
	},
	{ titulo: 'Referencia / Banco', tipo: 'texto', valor: (g) => g.referencia_banco },
	{ titulo: 'Estado', tipo: 'texto', valor: (g) => (g.estado === 'activo' ? 'Activo' : 'Anulado') },
];

export function GastosPanel() {
	const { cacheScope } = useAuth();
	return <Panel key={cacheScope} />;
}

function DetailItem({
	label,
	value,
	tabular = false,
}: {
	label: string;
	value: string;
	tabular?: boolean;
}) {
	return (
		<Box sx={{ minWidth: 0 }}>
			<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
				{label}
			</Typography>
			<Typography
				variant="body2"
				sx={{
					fontWeight: 600,
					fontVariantNumeric: tabular ? 'tabular-nums' : undefined,
					overflowWrap: 'anywhere',
				}}
			>
				{value}
			</Typography>
		</Box>
	);
}

function Panel() {
	const { cacheScope, profileStatus, perfil, isSigningOut } = useAuth();
	const enabled = profileStatus === 'ready' && !isSigningOut;
	const [searchParams, setSearchParams] = useSearchParams();
	const selectedId = searchParams.get('gastoId');
	const desdeUrl = searchParams.get('desde') ?? '',
		hastaUrl = searchParams.get('hasta') ?? '';
	const [filters, setFilters] = useState<FiltrosGasto>(() => ({
		...initial,
		desde: desdeUrl,
		hasta: hastaUrl,
	}));
	const [filtersOpen, setFiltersOpen] = useState(() => Boolean(desdeUrl || hastaUrl));

	useEffect(() => {
		setFilters((f) => ({ ...f, desde: desdeUrl, hasta: hastaUrl, pagina: 0 }));
		if (desdeUrl || hastaUrl) {
			setFiltersOpen(true);
		}
	}, [desdeUrl, hastaUrl]);

	const [search, setSearch] = useState('');
	const [creating, setCreating] = useState(false);
	const [editing, setEditing] = useState<Gasto | null>(null);
	const [annulling, setAnnulling] = useState<Gasto | null>(null);
	const [feedback, setFeedback] = useState<string | null>(null);
	const [pendingFile, setPendingFile] = useState<{ id: string; file: File | null } | null>(null);

	const hoy = useQuery({
		queryKey: ['gasto-fecha-club', cacheScope],
		queryFn: ({ signal }) => getFechaClubGastos(signal),
		enabled,
		retry: 1,
		staleTime: 20_000,
		refetchInterval: 30_000,
	});
	const categories = useCategoriasGasto({ cacheScope, enabled });

	useEffect(() => {
		const handle = setTimeout(
			() => setFilters((f) => ({ ...f, busqueda: search, pagina: 0 })),
			300,
		);
		return () => clearTimeout(handle);
	}, [search]);

	let dateError: string | null = null;
	try {
		rangoDiasCorreo(filters.desde, filters.hasta);
	} catch (e) {
		dateError = e instanceof Error ? e.message : 'Revisá las fechas.';
	}

	const list = useQuery({
		queryKey: ['gastos', cacheScope, filters],
		queryFn: ({ signal }) => getGastos(filters, signal),
		enabled: enabled && !dateError,
		retry: 1,
	});
	const detail = useQuery({
		queryKey: ['gasto', cacheScope, selectedId],
		queryFn: ({ signal }) => getGasto(selectedId ?? '', signal),
		enabled: enabled && !!selectedId,
		retry: 1,
	});

	useEffect(() => {
		if (list.data) {
			const last = Math.max(0, Math.ceil(list.data.total / filters.limite) - 1);
			if (filters.pagina > last) {
				setFilters((f) => ({ ...f, pagina: last }));
			}
		}
	}, [list.data, filters.pagina, filters.limite]);

	const filter = (values: Partial<FiltrosGasto>) =>
		setFilters((f) => ({ ...f, ...values, pagina: 0 }));

	const open = (id: string | null) => {
		const next = new URLSearchParams(searchParams);
		if (id) {
			next.set('gastoId', id);
		} else {
			next.delete('gastoId');
		}
		setSearchParams(next, { replace: true });
	};

	const saved = (gasto: Gasto, message: string) => {
		setCreating(false);
		setEditing(null);
		setAnnulling(null);
		setFeedback(message);
		open(gasto.id);
		void list.refetch();
		void detail.refetch();
	};

	const clearFilters = () => {
		setSearch('');
		setFilters({ ...initial });
		if (searchParams.has('desde') || searchParams.has('hasta')) {
			const next = new URLSearchParams(searchParams);
			next.delete('desde');
			next.delete('hasta');
			setSearchParams(next, { replace: true });
		}
	};

	const sort = (orden: FiltrosGasto['orden']) =>
		filter({ orden, ascendente: filters.orden === orden ? !filters.ascendente : true });

	const extraFiltersCount =
		Number(Boolean(filters.desde || filters.hasta)) +
		Number(Boolean(filters.categoriaId)) +
		Number(filters.metodo !== 'todos');

	const hasAnyFilter =
		Boolean(search.trim()) || filters.estado !== 'todos' || extraFiltersCount > 0;

	const selectedCategoryExists =
		!filters.categoriaId || (categories.data?.some((c) => c.id === filters.categoriaId) ?? false);

	const headers: [string, FiltrosGasto['orden'] | null, 'left' | 'right'][] = [
		['Fecha', 'fecha', 'left'],
		['Categoría', null, 'left'],
		['Concepto / Descripción', 'concepto', 'left'],
		['Importe', 'monto', 'right'],
		['Medio de pago', 'metodo_pago', 'left'],
		['Referencia / Banco', null, 'left'],
		['Estado', 'estado', 'left'],
		['Acciones', null, 'right'],
	];

	return (
		<Stack spacing={2.5}>
			{feedback && (
				<Alert severity="success" onClose={() => setFeedback(null)}>
					{feedback}
				</Alert>
			)}

			<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
				<Stack spacing={2.25}>
					<Stack
						direction={{ xs: 'column', sm: 'row' }}
						spacing={2}
						sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
					>
						<Box>
							<Typography component="h2" variant="h6">
								Historial de gastos
							</Typography>
							<Typography color="text.secondary" variant="body2">
								La fecha del gasto puede ser anterior a su día de carga en el sistema.
							</Typography>
						</Box>
						<Button
							variant="contained"
							startIcon={<AddOutlinedIcon />}
							disabled={!enabled || !hoy.data}
							onClick={() => setCreating(true)}
							sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, flexShrink: 0 }}
						>
							Registrar gasto
						</Button>
					</Stack>

					<Stack
						direction={{ xs: 'column', md: 'row' }}
						spacing={1.5}
						sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}
					>
						<TextField
							label="Buscar gasto"
							placeholder="Concepto o descripción…"
							size="small"
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
							sx={{ flex: 1, minWidth: 230 }}
						/>

						<Stack
							direction="row"
							spacing={0.75}
							useFlexGap
							sx={{ flexWrap: 'wrap', alignItems: 'center' }}
						>
							{ESTADO_PILLS.map((pill) => {
								const active = filters.estado === pill.value;
								return (
									<Chip
										key={pill.value}
										size="small"
										label={pill.label}
										clickable
										color={active ? 'primary' : 'default'}
										variant={active ? 'filled' : 'outlined'}
										onClick={() => filter({ estado: pill.value })}
									/>
								);
							})}

							<Button
								size="small"
								variant={filtersOpen || extraFiltersCount > 0 ? 'outlined' : 'text'}
								startIcon={<FilterListOutlinedIcon />}
								aria-expanded={filtersOpen}
								onClick={() => setFiltersOpen((v) => !v)}
							>
								{extraFiltersCount > 0 ? `Más filtros (${extraFiltersCount})` : 'Más filtros'}
							</Button>

							{hasAnyFilter && (
								<Button size="small" color="inherit" onClick={clearFilters}>
									Limpiar filtros
								</Button>
							)}
						</Stack>
					</Stack>

					<Collapse in={filtersOpen}>
						<Box
							sx={{
								p: 2,
								borderRadius: 1.5,
								bgcolor: 'action.hover',
								border: 1,
								borderColor: 'divider',
							}}
						>
							<Stack spacing={2}>
								<Stack
									direction={{ xs: 'column', lg: 'row' }}
									spacing={1.5}
									sx={{ alignItems: { lg: 'center' }, justifyContent: 'space-between' }}
								>
									<DateRangePresets
										label="Fecha del gasto"
										desde={filters.desde}
										hasta={filters.hasta}
										onSelect={({ desde, hasta }) => filter({ desde, hasta })}
									/>
									<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
										<TextField
											type="date"
											size="small"
											label="Desde"
											value={filters.desde}
											slotProps={{ inputLabel: { shrink: true } }}
											onChange={(e) => filter({ desde: e.target.value })}
										/>
										<TextField
											type="date"
											size="small"
											label="Hasta"
											value={filters.hasta}
											slotProps={{ inputLabel: { shrink: true } }}
											onChange={(e) => filter({ hasta: e.target.value })}
										/>
									</Stack>
								</Stack>

								<Box
									sx={{
										display: 'grid',
										gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
										gap: 1.5,
									}}
								>
									<TextField
										select
										size="small"
										label="Categoría"
										value={filters.categoriaId}
										onChange={(e) => filter({ categoriaId: e.target.value })}
									>
										<MenuItem value="">Todas las categorías</MenuItem>
										{!selectedCategoryExists && (
											<MenuItem value={filters.categoriaId}>Categoría seleccionada</MenuItem>
										)}
										{categories.data?.map((c) => (
											<MenuItem key={c.id} value={c.id}>
												{c.nombre}
												{c.estado === 'inactivo' ? ' (inactiva)' : ''}
											</MenuItem>
										))}
									</TextField>

									<TextField
										select
										size="small"
										label="Medio de pago"
										value={filters.metodo}
										onChange={(e) => filter({ metodo: e.target.value })}
									>
										<MenuItem value="todos">Todos los medios</MenuItem>
										<MenuItem value="efectivo">Efectivo</MenuItem>
										<MenuItem value="transferencia">Transferencia</MenuItem>
									</TextField>
								</Box>
							</Stack>
						</Box>
					</Collapse>

					<Stack
						direction={{ xs: 'column', sm: 'row' }}
						spacing={1.5}
						sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
					>
						<Typography variant="body2" color="text.secondary">
							{list.data
								? `${list.data.total} ${list.data.total === 1 ? 'gasto encontrado' : 'gastos encontrados'}.`
								: 'Consultando gastos…'}
						</Typography>
						<ExportGridButton
							nombreArchivo="gastos"
							filtroSnapshot={filters}
							orden={{ campo: filters.orden, direccion: filters.ascendente ? 'asc' : 'desc' }}
							columnas={columnasExportacionGastos}
							claveFila={(g) => g.id}
							disabled={
								!enabled ||
								!!dateError ||
								list.isPending ||
								list.isError ||
								search !== filters.busqueda
							}
							obtenerPagina={async (p) => {
								const resultado = await getReporteGastos(
									{
										...p.filtro,
										orden: p.orden.campo as FiltrosGasto['orden'],
										ascendente: p.orden.direccion === 'asc',
										pagina: p.pagina - 1,
										limite: p.tamanoPagina,
									},
									p.signal,
									{
										actorId: perfil?.id ?? '',
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

					{hoy.isError && (
						<Alert
							severity="warning"
							action={
								<Button size="small" color="inherit" onClick={() => void hoy.refetch()}>
									Reintentar
								</Button>
							}
						>
							No pudimos consultar la fecha del club. Las acciones se habilitarán al recuperarla.
						</Alert>
					)}
					{categories.isError && (
						<Alert
							severity="warning"
							action={
								<Button size="small" color="inherit" onClick={() => void categories.refetch()}>
									Reintentar
								</Button>
							}
						>
							No pudimos cargar el filtro de categorías.
						</Alert>
					)}

					{dateError ? (
						<Alert severity="warning">{dateError}</Alert>
					) : list.isError ? (
						<Alert
							severity="error"
							action={
								<Button size="small" color="inherit" onClick={() => void list.refetch()}>
									Reintentar
								</Button>
							}
						>
							{list.error.message}
						</Alert>
					) : (
						<>
							<TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
								<Table size="small" aria-label="Historial de gastos">
									<TableHead>
										<TableRow>
											{headers.map(([label, field, align]) => (
												<TableCell key={label} align={align}>
													{field ? (
														<TableSortLabel
															active={filters.orden === field}
															direction={
																filters.orden === field && filters.ascendente ? 'asc' : 'desc'
															}
															onClick={() => sort(field)}
														>
															{label}
														</TableSortLabel>
													) : (
														label
													)}
												</TableCell>
											))}
										</TableRow>
									</TableHead>
									<TableBody>
										{list.isPending ? (
											<TableRow>
												<TableCell colSpan={8} sx={{ py: 5 }}>
													<Stack
														direction="row"
														spacing={1.5}
														sx={{ justifyContent: 'center', alignItems: 'center' }}
													>
														<CircularProgress size={20} />
														<Typography variant="body2" color="text.secondary">
															Cargando gastos…
														</Typography>
													</Stack>
												</TableCell>
											</TableRow>
										) : !list.data?.gastos.length ? (
											<TableRow>
												<TableCell colSpan={8} sx={{ borderBottom: 0 }}>
													<EmptyState
														icon={<ReceiptOutlinedIcon />}
														title={
															hasAnyFilter
																? 'No encontramos gastos con estos filtros'
																: 'Todavía no hay gastos registrados'
														}
														description={
															hasAnyFilter
																? 'Probá ajustando el rango de fechas, la categoría o el texto de búsqueda.'
																: 'Registrá los egresos del club para mantener actualizada la caja.'
														}
														action={
															hasAnyFilter ? (
																<Button variant="outlined" size="small" onClick={clearFilters}>
																	Limpiar filtros
																</Button>
															) : hoy.data ? (
																<Button
																	variant="contained"
																	size="small"
																	startIcon={<AddOutlinedIcon />}
																	onClick={() => setCreating(true)}
																>
																	Registrar gasto
																</Button>
															) : null
														}
													/>
												</TableCell>
											</TableRow>
										) : (
											list.data.gastos.map((g) => (
												<TableRow key={g.id}>
													<TableCell
														sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
													>
														{fechaVisible(g.fecha)}
													</TableCell>
													<TableCell>{g.categoria?.nombre ?? 'Categoría no disponible'}</TableCell>
													<TableCell>
														<Typography variant="body2" sx={{ fontWeight: 600 }}>
															{g.concepto}
														</Typography>
														{g.descripcion && (
															<Typography
																variant="caption"
																color="text.secondary"
																sx={{ display: 'block' }}
															>
																{g.descripcion}
															</Typography>
														)}
													</TableCell>
													<TableCell
														align="right"
														sx={{
															whiteSpace: 'nowrap',
															fontWeight: 600,
															fontVariantNumeric: 'tabular-nums',
														}}
													>
														{monedaGasto(g.monto)}
													</TableCell>
													<TableCell sx={{ whiteSpace: 'nowrap' }}>
														{g.metodo_pago === 'efectivo' ? 'Efectivo' : 'Transferencia'}
													</TableCell>
													<TableCell>{g.referencia_banco ?? '—'}</TableCell>
													<TableCell>
														<Chip
															size="small"
															label={g.estado === 'activo' ? 'Activo' : 'Anulado'}
															color={g.estado === 'activo' ? 'success' : 'default'}
														/>
													</TableCell>
													<TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
														<Stack
															direction="row"
															spacing={0.5}
															useFlexGap
															sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}
														>
															<Button size="small" variant="outlined" onClick={() => open(g.id)}>
																Ver detalle
															</Button>
															{hoy.data && puedeEditarGasto(g, hoy.data) && (
																<Button size="small" onClick={() => setEditing(g)}>
																	Editar
																</Button>
															)}
															{hoy.data && puedeAnularGasto(g, hoy.data, perfil?.rol ?? '') && (
																<Button size="small" color="error" onClick={() => setAnnulling(g)}>
																	Anular
																</Button>
															)}
														</Stack>
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
								page={Math.min(
									filters.pagina,
									Math.max(0, Math.ceil((list.data?.total ?? 0) / filters.limite) - 1),
								)}
								rowsPerPage={filters.limite}
								rowsPerPageOptions={[20, 50, 100]}
								onPageChange={(_, pagina) => setFilters((f) => ({ ...f, pagina }))}
								onRowsPerPageChange={(e) => filter({ limite: Number(e.target.value) })}
								labelRowsPerPage="Filas por página"
								labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
							/>
						</>
					)}
				</Stack>
			</Paper>

			{creating && (
				<CreateGastoDialog
					hoy={hoy.data ?? ''}
					onClose={() => setCreating(false)}
					onRegistered={(gasto, file, evidenciaPrevista) => {
						if (evidenciaPrevista) {
							setPendingFile({ id: gasto.id, file });
						}
						saved(gasto, mensajeAltaGasto(evidenciaPrevista, !!file));
					}}
				/>
			)}
			{editing && (
				<EditGastoDialog
					gasto={editing}
					onClose={() => setEditing(null)}
					onSaved={(g) => saved(g, 'Gasto actualizado.')}
				/>
			)}
			{annulling && (
				<AnularGastoDialog
					gasto={annulling}
					onClose={() => {
						setAnnulling(null);
						void list.refetch();
						void detail.refetch();
					}}
					onSaved={(g) =>
						saved(g, 'Anulación confirmada; el gasto y su devolución permanecen en el historial.')
					}
				/>
			)}

			<Dialog
				open={!!selectedId}
				fullWidth
				maxWidth="md"
				aria-labelledby="gasto-detalle-title"
				onClose={() => open(null)}
			>
				<DialogTitle id="gasto-detalle-title">
					<Stack
						direction="row"
						spacing={1}
						useFlexGap
						sx={{ alignItems: 'center', flexWrap: 'wrap' }}
					>
						<span>Detalle del gasto</span>
						{detail.data && (
							<Chip
								size="small"
								label={detail.data.estado === 'activo' ? 'Activo' : 'Anulado'}
								color={detail.data.estado === 'activo' ? 'success' : 'default'}
							/>
						)}
					</Stack>
				</DialogTitle>
				<DialogContent dividers>
					{detail.isPending ? (
						<Stack
							direction="row"
							spacing={1.5}
							sx={{ py: 4, justifyContent: 'center', alignItems: 'center' }}
						>
							<CircularProgress size={20} />
							<Typography variant="body2" color="text.secondary">
								Cargando detalle del gasto…
							</Typography>
						</Stack>
					) : detail.isError ? (
						<Alert
							severity="error"
							action={
								<Button size="small" color="inherit" onClick={() => void detail.refetch()}>
									Reintentar
								</Button>
							}
						>
							No pudimos consultar el gasto.
						</Alert>
					) : !detail.data ? (
						<Alert severity="info">No encontramos ese gasto.</Alert>
					) : (
						<Stack spacing={2.5}>
							<Paper variant="outlined" sx={{ p: 2.5, bgcolor: 'action.hover' }}>
								<Stack spacing={2}>
									<Stack
										direction={{ xs: 'column', sm: 'row' }}
										spacing={1.5}
										sx={{ alignItems: { sm: 'flex-start' }, justifyContent: 'space-between' }}
									>
										<Box sx={{ minWidth: 0 }}>
											<Typography component="h3" variant="h6">
												{detail.data.concepto}
											</Typography>
											<Typography variant="body2" color="text.secondary">
												{detail.data.categoria?.nombre ?? 'Categoría no disponible'}
											</Typography>
										</Box>
										<Typography
											variant="h5"
											sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}
										>
											{monedaGasto(detail.data.monto)}
										</Typography>
									</Stack>

									<Divider />

									<Box
										sx={{
											display: 'grid',
											gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
											gap: 1.75,
										}}
									>
										<DetailItem
											label="Fecha del gasto"
											value={fechaVisible(detail.data.fecha)}
											tabular
										/>
										<DetailItem
											label="Cargado el"
											value={instante(detail.data.created_at)}
											tabular
										/>
										<DetailItem
											label="Medio de pago"
											value={
												detail.data.metodo_pago === 'efectivo'
													? 'Efectivo'
													: 'Transferencia bancaria'
											}
										/>
										<DetailItem
											label="Referencia / Banco"
											value={detail.data.referencia_banco ?? 'Sin referencia informada'}
										/>
									</Box>

									{detail.data.descripcion && (
										<>
											<Divider />
											<Box>
												<Typography
													variant="caption"
													color="text.secondary"
													sx={{ display: 'block' }}
												>
													Descripción adicional
												</Typography>
												<Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.25 }}>
													{detail.data.descripcion}
												</Typography>
											</Box>
										</>
									)}
								</Stack>
							</Paper>

							{detail.data.estado === 'anulado' && (
								<Alert severity="info">
									Anulado el {detail.data.anulado_at ? instante(detail.data.anulado_at) : '—'}.
									Motivo: {detail.data.motivo_anulacion}
								</Alert>
							)}

							<GastoEvidencia
								key={`${cacheScope}:${detail.data.id}`}
								gastoId={detail.data.id}
								editable={!!hoy.data && puedeEditarGasto(detail.data, hoy.data)}
								initialFile={pendingFile?.id === detail.data.id ? pendingFile.file : null}
								onPendingCleared={() => setPendingFile(null)}
								onUpdated={() => {
									setPendingFile(null);
									void detail.refetch();
								}}
							/>
						</Stack>
					)}
				</DialogContent>
				<DialogActions>
					<Button onClick={() => open(null)}>Cerrar</Button>
				</DialogActions>
			</Dialog>
		</Stack>
	);
}
