import AddIcon from '@mui/icons-material/Add';
import FilterListOutlinedIcon from '@mui/icons-material/FilterListOutlined';
import PeopleOutlineOutlinedIcon from '@mui/icons-material/PeopleOutlineOutlined';
import SearchIcon from '@mui/icons-material/Search';
import {
	Alert,
	Box,
	Button,
	Chip,
	CircularProgress,
	Collapse,
	InputAdornment,
	MenuItem,
	Paper,
	Radio,
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
import { type ReactNode, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getCategorias } from '#entities/categoria';
import { getDeportes } from '#entities/deporte';
import { useAuth } from '#entities/session';
import {
	type CriteriosSocios,
	criteriosSociosDesdeUrl,
	getSociosReporte,
	type SocioListado,
	type SocioReporte,
	useSocios,
} from '#entities/socio';
import { CreateSocioDialog } from '#features/create-socio';
import { type ColumnaExportacion, ExportGridButton } from '#features/export-grid';
import { InscribirSocioDialog } from '#features/inscribir-socio';
import { useDebounce } from '#shared/lib/useDebounce';
import { EmptyState, InfoTooltip, PageHeader } from '#shared/ui';

const ESTADO_PILLS: readonly { value: 'activo' | 'inactivo' | 'todos'; label: string }[] = [
	{ value: 'activo', label: 'Activos' },
	{ value: 'inactivo', label: 'Inactivos' },
	{ value: 'todos', label: 'Todos' },
];

const columnasSocios: readonly ColumnaExportacion<SocioReporte>[] = [
	{ titulo: 'Número de socio', tipo: 'numero', valor: (s) => s.numero_socio },
	{ titulo: 'DNI', tipo: 'texto', valor: (s) => s.dni },
	{ titulo: 'Apellido', tipo: 'texto', valor: (s) => s.apellido },
	{ titulo: 'Nombre', tipo: 'texto', valor: (s) => s.nombre },
	{
		titulo: 'Estado',
		tipo: 'texto',
		valor: (s) => (s.estado === 'activo' ? 'Activo' : 'Inactivo'),
	},
	{ titulo: 'Correo', tipo: 'texto', valor: (s) => s.email },
	{ titulo: 'Correo inválido', tipo: 'texto', valor: (s) => (s.email_invalido ? 'Sí' : 'No') },
	{
		titulo: 'Acepta comunicaciones',
		tipo: 'texto',
		valor: (s) => (s.acepta_comunicaciones ? 'Sí' : 'No'),
	},
	{ titulo: 'Moroso', tipo: 'texto', valor: (s) => (s.es_moroso ? 'Sí' : 'No') },
	{ titulo: 'Deuda pendiente', tipo: 'numero', valor: (s) => s.deuda_pendiente },
	{ titulo: 'Cuotas pendientes', tipo: 'numero', valor: (s) => s.pendientes_count },
	{ titulo: 'Deportes con inscripción vigente', tipo: 'texto', valor: (s) => s.deportes },
];

const monedaSocios = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

export interface SociosPanelProps {
	actions?: ReactNode;
	renderSelectedSocio?: (socio: SocioListado) => ReactNode;
}

interface SociosListProps extends SociosPanelProps {
	cacheScope: string;
	enabled: boolean;
}

export function SociosPanel(props: SociosPanelProps) {
	const { cacheScope, profileStatus } = useAuth();
	return (
		<SociosList
			key={cacheScope}
			cacheScope={cacheScope}
			enabled={profileStatus === 'ready'}
			{...props}
		/>
	);
}

function SociosList({ cacheScope, enabled, actions, renderSelectedSocio }: SociosListProps) {
	const [params, setParams] = useSearchParams();
	const urlKey = params.toString();
	const initial = criteriosSociosDesdeUrl(params);
	const { perfil } = useAuth();
	const [filtros, setFiltros] = useState<CriteriosSocios>(initial);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const [searchTerm, setSearchTerm] = useState(initial.buscar);
	const [estado, setEstado] = useState<'activo' | 'inactivo' | 'todos'>(initial.estado);
	const [filtersOpen, setFiltersOpen] = useState(() =>
		Boolean(
			initial.deporte_id ||
				initial.categoria_id ||
				initial.estado_pago !== 'todos' ||
				initial.email_invalido !== 'todos',
		),
	);
	const [selectedSocio, setSelectedSocio] = useState<SocioListado | null>(null);
	const [createOpen, setCreateOpen] = useState(false);
	const [inscripcionTarget, setInscripcionTarget] = useState<SocioListado | null>(null);
	const [inscripcionOpen, setInscripcionOpen] = useState(false);
	const [recentSelection, setRecentSelection] = useState<{
		socio: SocioListado;
		kind: 'created' | 'verified';
	} | null>(null);

	const clearSelection = () => {
		setInscripcionOpen(false);
		setInscripcionTarget(null);
		setSelectedSocio(null);
		setRecentSelection(null);
	};

	const debouncedSearchTerm = useDebounce(searchTerm, 500);
	const filtering = searchTerm !== debouncedSearchTerm;
	const { data, isPending, isFetching, isError, refetch } = useSocios(
		page,
		pageSize,
		debouncedSearchTerm,
		{ cacheScope, enabled: enabled && !filtering, estado, filtros },
	);
	const loading = !enabled || isPending || isFetching || filtering;
	const result = !loading && !isError ? data : undefined;
	const visibleSelected = result?.socios.find((socio) => socio.id === selectedSocio?.id);
	const recent = recentSelection?.socio.id === selectedSocio?.id ? recentSelection : null;
	const selected = enabled ? (visibleSelected ?? recent?.socio) : undefined;

	const sports = useQuery({
		queryKey: ['deportes', cacheScope, 'reporte-socios'],
		queryFn: ({ signal }) => getDeportes(false, signal),
		enabled,
		retry: 1,
	});
	const categories = useQuery({
		queryKey: ['categorias', cacheScope, 'reporte-socios', filtros.deporte_id],
		queryFn: ({ signal }) => getCategorias(filtros.deporte_id, false, signal),
		enabled: enabled && !!filtros.deporte_id,
		retry: 1,
	});

	const cambiarFiltro = <K extends keyof CriteriosSocios>(k: K, v: CriteriosSocios[K]) => {
		clearSelection();
		setPage(1);
		setFiltros((x) => ({ ...x, [k]: v, ...(k === 'deporte_id' ? { categoria_id: '' } : {}) }));
	};

	const ordenar = (orden: CriteriosSocios['orden']) => {
		clearSelection();
		setPage(1);
		setFiltros((x) => ({
			...x,
			orden,
			direccion: x.orden === orden && x.direccion === 'asc' ? 'desc' : 'asc',
		}));
	};

	const cabecera = (texto: string, orden: CriteriosSocios['orden']) => (
		<TableSortLabel
			active={filtros.orden === orden}
			direction={filtros.orden === orden ? filtros.direccion : 'asc'}
			onClick={() => ordenar(orden)}
		>
			{texto}
		</TableSortLabel>
	);

	const filtroSnapshot: CriteriosSocios = {
		...filtros,
		pagina: page - 1,
		limite: pageSize,
		buscar: debouncedSearchTerm,
		estado,
	};

	useEffect(() => {
		const next = criteriosSociosDesdeUrl(new URLSearchParams(urlKey));
		setFiltros(next);
		setEstado(next.estado);
		setSearchTerm(next.buscar);
		setPage(1);
		setSelectedSocio(null);
		setRecentSelection(null);
		setInscripcionOpen(false);
		setInscripcionTarget(null);
		if (
			next.deporte_id ||
			next.categoria_id ||
			next.estado_pago !== 'todos' ||
			next.email_invalido !== 'todos'
		) {
			setFiltersOpen(true);
		}
	}, [urlKey]);

	useEffect(() => {
		if (enabled && !filtering && data && page > data.totalPages) {
			setPage(data.totalPages);
			setSelectedSocio(null);
			setRecentSelection(null);
		}
	}, [data, enabled, filtering, page]);

	const limpiarFiltros = () => {
		clearSelection();
		setPage(1);
		setSearchTerm('');
		setEstado('activo');
		setFiltros(criteriosSociosDesdeUrl(new URLSearchParams()));
		if (params.toString()) {
			setParams(new URLSearchParams(), { replace: true });
		}
	};

	const extraFiltersCount =
		Number(Boolean(filtros.deporte_id)) +
		Number(Boolean(filtros.categoria_id)) +
		Number(filtros.estado_pago !== 'todos') +
		Number(filtros.email_invalido !== 'todos');

	const hasAnyFilter = Boolean(searchTerm.trim()) || estado !== 'activo' || extraFiltersCount > 0;

	const totalSocios = result?.total ?? data?.total ?? 0;

	return (
		<Stack spacing={3}>
			<PageHeader
				title="Padrón de socios"
				subtitle="Consultá el padrón, filtrá por actividad o estado de pago y gestioná inscripciones."
				actions={
					<>
						<Button
							variant="contained"
							startIcon={<AddIcon />}
							disabled={!enabled}
							onClick={() => setCreateOpen(true)}
						>
							Nuevo socio
						</Button>
						{actions}
					</>
				}
			/>

			<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
				<Stack spacing={2.25}>
					<Stack
						direction={{ xs: 'column', md: 'row' }}
						spacing={1.5}
						sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}
					>
						<TextField
							label="Buscar socio"
							placeholder="Apellido, nombre, DNI o matrícula…"
							size="small"
							value={searchTerm}
							onChange={(event) => {
								clearSelection();
								setPage(1);
								setSearchTerm(event.target.value);
							}}
							slotProps={{
								input: {
									startAdornment: (
										<InputAdornment position="start">
											<SearchIcon fontSize="small" color="action" />
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
											clearSelection();
											setPage(1);
											setEstado(pill.value);
										}}
									/>
								);
							})}

							<Button
								size="small"
								variant={filtersOpen || extraFiltersCount > 0 ? 'outlined' : 'text'}
								startIcon={<FilterListOutlinedIcon />}
								aria-expanded={filtersOpen}
								onClick={() => setFiltersOpen((open) => !open)}
							>
								{extraFiltersCount > 0 ? `Más filtros (${extraFiltersCount})` : 'Más filtros'}
							</Button>

							{hasAnyFilter && (
								<Button size="small" color="inherit" onClick={limpiarFiltros}>
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
								display: 'grid',
								gridTemplateColumns: {
									xs: '1fr',
									sm: 'repeat(2, minmax(0, 1fr))',
									lg: 'repeat(4, minmax(0, 1fr))',
								},
								gap: 1.5,
							}}
						>
							<TextField
								select
								size="small"
								label="Deporte"
								value={filtros.deporte_id}
								onChange={(e) => cambiarFiltro('deporte_id', e.target.value)}
							>
								<MenuItem value="">Todos los deportes</MenuItem>
								{filtros.deporte_id && !sports.data?.some((d) => d.id === filtros.deporte_id) && (
									<MenuItem value={filtros.deporte_id}>
										{sports.isPending ? 'Cargando…' : 'Deporte seleccionado'}
									</MenuItem>
								)}
								{sports.data?.map((d) => (
									<MenuItem key={d.id} value={d.id}>
										{d.nombre}
									</MenuItem>
								))}
							</TextField>

							<TextField
								select
								size="small"
								label="Categoría"
								value={filtros.categoria_id}
								disabled={!filtros.deporte_id || categories.isPending}
								onChange={(e) => cambiarFiltro('categoria_id', e.target.value)}
							>
								<MenuItem value="">Todas las categorías</MenuItem>
								{filtros.categoria_id &&
									!categories.data?.some((c) => c.id === filtros.categoria_id) && (
										<MenuItem value={filtros.categoria_id}>
											{categories.isPending ? 'Cargando…' : 'Categoría seleccionada'}
										</MenuItem>
									)}
								{categories.data?.map((c) => (
									<MenuItem key={c.id} value={c.id}>
										{c.nombre}
									</MenuItem>
								))}
							</TextField>

							<TextField
								select
								size="small"
								label="Estado de pago"
								value={filtros.estado_pago}
								onChange={(e) =>
									cambiarFiltro('estado_pago', e.target.value as CriteriosSocios['estado_pago'])
								}
							>
								<MenuItem value="todos">Todos</MenuItem>
								<MenuItem value="moroso">Morosos (+30 días)</MenuItem>
								<MenuItem value="al_dia">Al día</MenuItem>
							</TextField>

							<TextField
								select
								size="small"
								label="Correo electrónico"
								value={filtros.email_invalido}
								onChange={(e) =>
									cambiarFiltro(
										'email_invalido',
										e.target.value as CriteriosSocios['email_invalido'],
									)
								}
							>
								<MenuItem value="todos">Todos</MenuItem>
								<MenuItem value="si">Marcado como inválido</MenuItem>
								<MenuItem value="no">Sin alerta de correo</MenuItem>
							</TextField>
						</Box>
					</Collapse>

					{(sports.isError || categories.isError) && (
						<Alert severity="warning">
							No pudimos cargar el catálogo de deportes y categorías. Volvé a intentarlo.
						</Alert>
					)}

					{selected && (
						<Paper
							variant="outlined"
							sx={{
								p: 2,
								borderColor: recent?.kind === 'created' ? 'success.main' : 'primary.main',
								bgcolor: 'action.selected',
							}}
						>
							<Stack spacing={1.25}>
								<Stack
									direction={{ xs: 'column', md: 'row' }}
									spacing={1.5}
									sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}
								>
									<Box sx={{ minWidth: 0 }}>
										<Typography variant="body2" sx={{ fontWeight: 700 }}>
											{recent?.kind === 'created'
												? 'Alta confirmada · '
												: recent?.kind === 'verified'
													? 'Registro existente verificado · '
													: 'Socio seleccionado · '}
											{selected.apellido}, {selected.nombre}
										</Typography>
										<Typography
											variant="caption"
											color="text.secondary"
											sx={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}
										>
											Socio #{selected.numero_socio} · DNI {selected.dni}
											{selected.estado !== 'activo'
												? ' · Inactivo (reactivalo desde su ficha para inscribirlo)'
												: ''}
										</Typography>
									</Box>

									<Stack
										direction="row"
										spacing={1}
										useFlexGap
										sx={{ flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}
									>
										<Button
											size="small"
											variant="contained"
											disabled={selected.estado !== 'activo' || !enabled}
											onClick={() => {
												setInscripcionTarget(selected);
												setInscripcionOpen(true);
											}}
										>
											Inscribir a actividad
										</Button>
										<Button
											size="small"
											variant="outlined"
											component={Link}
											to={`/socios/${selected.id}`}
										>
											Abrir ficha
										</Button>
										{renderSelectedSocio?.(selected)}
										<Button size="small" color="inherit" onClick={clearSelection}>
											Quitar selección
										</Button>
									</Stack>
								</Stack>

								{recent?.kind === 'verified' && (
									<Typography variant="caption" color="text.secondary">
										Se seleccionó el registro encontrado por DNI; esto no confirma que el intento
										anterior lo haya creado.
									</Typography>
								)}
								{recent && !visibleSelected && (
									<Typography variant="caption" color="text.secondary">
										{result
											? 'Este socio no aparece en la página o filtros actuales, pero sigue seleccionado.'
											: 'La selección reciente se conserva mientras se actualiza el listado.'}
									</Typography>
								)}
							</Stack>
						</Paper>
					)}

					<Stack
						direction={{ xs: 'column', sm: 'row' }}
						spacing={1.5}
						sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
					>
						<Typography variant="body2" color="text.secondary">
							{loading
								? 'Consultando padrón de socios…'
								: `${totalSocios} ${totalSocios === 1 ? 'socio encontrado' : 'socios encontrados'}. Seleccioná una fila para inscribir rápido.`}
						</Typography>
						<ExportGridButton<SocioReporte, CriteriosSocios>
							nombreArchivo="socios"
							filtroSnapshot={filtroSnapshot}
							orden={{ campo: filtros.orden, direccion: filtros.direccion }}
							columnas={columnasSocios}
							claveFila={(s) => s.id}
							disabled={loading || isError || !perfil}
							obtenerPagina={async ({ filtro, pagina, tamanoPagina, version, signal }) => {
								const p = await getSociosReporte(
									{ ...filtro, pagina: pagina - 1, limite: tamanoPagina },
									signal,
									{ actorId: perfil?.id, revision: version, exportar: true },
								);
								return { filas: p.filas, total: p.total, version: p.revision };
							}}
						/>
					</Stack>

					{loading ? (
						<Stack
							direction="row"
							spacing={1.5}
							role="status"
							sx={{ py: 5, justifyContent: 'center', alignItems: 'center' }}
						>
							<CircularProgress size={20} aria-label="Cargando socios" />
							<Typography variant="body2" color="text.secondary">
								Cargando socios…
							</Typography>
						</Stack>
					) : isError ? (
						<Alert
							severity="error"
							action={
								<Button size="small" color="inherit" onClick={() => void refetch()}>
									Reintentar
								</Button>
							}
						>
							No pudimos cargar los socios. Revisá la conexión y volvé a intentar.
						</Alert>
					) : result ? (
						result.socios.length === 0 ? (
							<EmptyState
								icon={<PeopleOutlineOutlinedIcon />}
								title={
									hasAnyFilter
										? 'No encontramos socios con esos filtros'
										: 'Todavía no hay socios cargados'
								}
								description={
									hasAnyFilter
										? 'Probá cambiando el estado, el deporte o el texto de búsqueda.'
										: 'Registrá el primer socio del club para comenzar a gestionar actividades y cuotas.'
								}
								action={
									hasAnyFilter ? (
										<Button variant="outlined" size="small" onClick={limpiarFiltros}>
											Limpiar filtros
										</Button>
									) : (
										<Button
											variant="contained"
											size="small"
											startIcon={<AddIcon />}
											onClick={() => setCreateOpen(true)}
										>
											Nuevo socio
										</Button>
									)
								}
							/>
						) : (
							<>
								<TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
									<Table size="small" aria-label="Listado de socios">
										<TableHead>
											<TableRow>
												<TableCell sx={{ width: 56 }}>Sel.</TableCell>
												<TableCell>{cabecera('Socio', 'apellido')}</TableCell>
												<TableCell>{cabecera('Matrícula', 'numero_socio')}</TableCell>
												<TableCell>{cabecera('Estado', 'estado')}</TableCell>
												<TableCell>
													<Stack direction="row" spacing={0.25} sx={{ alignItems: 'center' }}>
														<span>Pago</span>
														<InfoTooltip
															label="Significado del estado de pago"
															title="Al día: sin cuotas vencidas de más de 30 días. Moroso: registra al menos una cuota impaga con más de 30 días."
														/>
													</Stack>
												</TableCell>
												<TableCell align="right">
													{cabecera('Deuda pendiente', 'deuda_pendiente')}
												</TableCell>
												<TableCell align="right">Acciones</TableCell>
											</TableRow>
										</TableHead>
										<TableBody>
											{result.socios.map((socio) => (
												<TableRow
													key={socio.id}
													hover
													selected={selected?.id === socio.id}
													onClick={() => {
														setSelectedSocio(socio);
														setRecentSelection(null);
													}}
													sx={{ cursor: 'pointer' }}
												>
													<TableCell onClick={(e) => e.stopPropagation()}>
														<Radio
															size="small"
															name="socio-operativo"
															checked={selected?.id === socio.id}
															onChange={() => {
																setSelectedSocio(socio);
																setRecentSelection(null);
															}}
															slotProps={{
																input: {
																	'aria-label': `Seleccionar a ${socio.apellido}, ${socio.nombre}, número ${socio.numero_socio}`,
																},
															}}
														/>
													</TableCell>
													<TableCell>
														<Typography variant="body2" sx={{ fontWeight: 600 }}>
															{socio.apellido}, {socio.nombre}
														</Typography>
														<Typography
															variant="caption"
															color="text.secondary"
															sx={{ fontVariantNumeric: 'tabular-nums' }}
														>
															DNI {socio.dni}
														</Typography>
													</TableCell>
													<TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>
														<Typography variant="body2" color="text.secondary">
															#{socio.numero_socio}
														</Typography>
													</TableCell>
													<TableCell>
														<Chip
															size="small"
															label={socio.estado === 'activo' ? 'Activo' : 'Inactivo'}
															color={socio.estado === 'activo' ? 'success' : 'default'}
														/>
													</TableCell>
													<TableCell>
														<Stack
															direction="row"
															spacing={0.75}
															useFlexGap
															sx={{ flexWrap: 'wrap', alignItems: 'center' }}
														>
															<Chip
																size="small"
																color={socio.es_moroso ? 'error' : 'success'}
																label={socio.es_moroso ? 'Moroso' : 'Al día'}
															/>
															{socio.email_invalido && (
																<Chip
																	size="small"
																	variant="outlined"
																	color="warning"
																	label="Correo inválido"
																/>
															)}
														</Stack>
													</TableCell>
													<TableCell
														align="right"
														sx={{
															whiteSpace: 'nowrap',
															fontWeight: socio.deuda_pendiente > 0 ? 600 : 400,
															color: socio.deuda_pendiente > 0 ? 'warning.main' : 'text.secondary',
														}}
													>
														{monedaSocios.format(socio.deuda_pendiente)}
													</TableCell>
													<TableCell
														align="right"
														sx={{ whiteSpace: 'nowrap' }}
														onClick={(e) => e.stopPropagation()}
													>
														<Button
															size="small"
															variant="outlined"
															component={Link}
															to={`/socios/${socio.id}`}
														>
															Ver ficha
														</Button>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</TableContainer>
								<TablePagination
									component="div"
									count={result.total}
									page={Math.min(page - 1, Math.max(0, Math.ceil(result.total / pageSize) - 1))}
									rowsPerPage={pageSize}
									rowsPerPageOptions={[20, 50, 100]}
									onPageChange={(_, nextPage) => {
										clearSelection();
										setPage(nextPage + 1);
									}}
									onRowsPerPageChange={(event) => {
										clearSelection();
										setPage(1);
										setPageSize(Number(event.target.value));
									}}
									labelRowsPerPage="Socios por página"
									labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
								/>
							</>
						)
					) : null}
				</Stack>
			</Paper>

			{inscripcionTarget && (
				<InscribirSocioDialog
					key={inscripcionTarget.id}
					open={inscripcionOpen}
					onClose={() => setInscripcionOpen(false)}
					socio={inscripcionTarget}
				/>
			)}
			<CreateSocioDialog
				open={createOpen}
				onClose={() => setCreateOpen(false)}
				onCreated={(socio) => {
					setSelectedSocio(socio);
					setRecentSelection({ socio, kind: 'created' });
				}}
				onVerifyExisting={(socio) => {
					setSelectedSocio(socio);
					setRecentSelection({ socio, kind: 'verified' });
					setCreateOpen(false);
				}}
			/>
		</Stack>
	);
}
