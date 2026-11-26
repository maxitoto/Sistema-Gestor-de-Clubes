import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import {
	Alert,
	Box,
	Button,
	Chip,
	CircularProgress,
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
	const [params] = useSearchParams();
	const urlKey = params.toString();
	const initial = criteriosSociosDesdeUrl(params);
	const { perfil } = useAuth();
	const [filtros, setFiltros] = useState<CriteriosSocios>(initial);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const [searchTerm, setSearchTerm] = useState(initial.buscar);
	const [estado, setEstado] = useState<'activo' | 'inactivo' | 'todos'>(initial.estado);
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
			direction={filtros.direccion}
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
	}, [urlKey]);
	useEffect(() => {
		if (enabled && !filtering && data && page > data.totalPages) {
			setPage(data.totalPages);
			setSelectedSocio(null);
			setRecentSelection(null);
		}
	}, [data, enabled, filtering, page]);

	const changePage = (nextPage: number) => {
		clearSelection();
		setPage(nextPage);
	};

	return (
		<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
			<Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 1 }}>
				<Typography component="h1" variant="h5" sx={{ flexGrow: 1 }}>
					Padrón General de Socios
				</Typography>
				<Button
					variant="contained"
					startIcon={<AddIcon />}
					disabled={!enabled}
					onClick={() => setCreateOpen(true)}
				>
					Nuevo socio
				</Button>
				{actions}
			</Box>
			<Typography color="text.secondary" sx={{ mb: 3 }}>
				Consultá el padrón y seleccioná un socio para inscribirlo en una actividad.
			</Typography>
			<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
				<TextField
					label="Nombre, apellido, DNI o número"
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
									<SearchIcon fontSize="small" />
								</InputAdornment>
							),
						},
					}}
					sx={{ width: { xs: '100%', sm: 360 } }}
				/>
				<TextField
					select
					label="Socios por página"
					size="small"
					value={pageSize}
					onChange={(event) => {
						clearSelection();
						setPage(1);
						setPageSize(Number(event.target.value));
					}}
					sx={{ minWidth: 160 }}
				>
					{[20, 50, 100].map((size) => (
						<MenuItem key={size} value={size}>
							{size}
						</MenuItem>
					))}
				</TextField>
				<TextField
					select
					label="Estado del socio"
					value={estado}
					sx={{ minWidth: 160 }}
					onChange={(event) => {
						const value = event.target.value;
						if (value === 'activo' || value === 'inactivo' || value === 'todos') {
							clearSelection();
							setPage(1);
							setEstado(value);
						}
					}}
				>
					<MenuItem value="activo">Activos</MenuItem>
					<MenuItem value="inactivo">Inactivos</MenuItem>
					<MenuItem value="todos">Todos</MenuItem>
				</TextField>
			</Box>
			<Stack
				direction={{ xs: 'column', sm: 'row' }}
				useFlexGap
				sx={{ flexWrap: 'wrap', mb: 2 }}
				spacing={2}
			>
				<TextField
					select
					size="small"
					label="Deporte"
					value={filtros.deporte_id}
					sx={{ minWidth: 170 }}
					onChange={(e) => cambiarFiltro('deporte_id', e.target.value)}
				>
					<MenuItem value="">Todos</MenuItem>
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
					sx={{ minWidth: 170 }}
					onChange={(e) => cambiarFiltro('categoria_id', e.target.value)}
				>
					<MenuItem value="">Todas</MenuItem>
					{filtros.categoria_id && !categories.data?.some((c) => c.id === filtros.categoria_id) && (
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
					sx={{ minWidth: 170 }}
					onChange={(e) =>
						cambiarFiltro('estado_pago', e.target.value as CriteriosSocios['estado_pago'])
					}
				>
					<MenuItem value="todos">Todos</MenuItem>
					<MenuItem value="moroso">Morosos</MenuItem>
					<MenuItem value="al_dia">Al día</MenuItem>
				</TextField>
				<TextField
					select
					size="small"
					label="Correo inválido"
					value={filtros.email_invalido}
					sx={{ minWidth: 170 }}
					onChange={(e) =>
						cambiarFiltro('email_invalido', e.target.value as CriteriosSocios['email_invalido'])
					}
				>
					<MenuItem value="todos">Todos</MenuItem>
					<MenuItem value="si">Sí</MenuItem>
					<MenuItem value="no">No</MenuItem>
				</TextField>
				<Button
					onClick={() => {
						clearSelection();
						setPage(1);
						setSearchTerm('');
						setEstado('todos');
						setFiltros(criteriosSociosDesdeUrl(new URLSearchParams('estado=todos')));
					}}
				>
					Limpiar filtros
				</Button>
			</Stack>
			{(sports.isError || categories.isError) && (
				<Alert severity="warning">
					No se pudo cargar el catálogo de filtros. Volvé a intentarlo.
				</Alert>
			)}
			<Box sx={{ mb: 2 }}>
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
			</Box>
			{loading && (
				<Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 4 }}>
					<CircularProgress size={24} aria-label="Cargando socios" />
					<Typography>Cargando socios…</Typography>
				</Box>
			)}
			{!loading && isError && (
				<Alert severity="error" action={<Button onClick={() => void refetch()}>Reintentar</Button>}>
					No pudimos cargar los socios. Revisá la conexión y volvé a intentar.
				</Alert>
			)}
			{result && (
				<>
					{result.socios.length === 0 ? (
						<Alert severity="info">
							{debouncedSearchTerm.trim()
								? 'No se encontraron socios para estos filtros.'
								: 'Todavía no hay socios para mostrar.'}
						</Alert>
					) : (
						<TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
							<Table size="small" aria-label="Listado de socios">
								<TableHead>
									<TableRow>
										<TableCell sx={{ width: 72 }}>Seleccionar</TableCell>
										<TableCell>{cabecera('Socio', 'apellido')}</TableCell>
										<TableCell>{cabecera('Matrícula', 'numero_socio')}</TableCell>
										<TableCell>{cabecera('Estado', 'estado')}</TableCell>
										<TableCell>Pago</TableCell>
										<TableCell align="right">
											{cabecera('Deuda pendiente', 'deuda_pendiente')}
										</TableCell>
										<TableCell>Acciones</TableCell>
									</TableRow>
								</TableHead>
								<TableBody>
									{result.socios.map((socio) => (
										<TableRow key={socio.id} hover selected={selected?.id === socio.id}>
											<TableCell>
												<Radio
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
												<Typography variant="caption" color="text.secondary">
													DNI: {socio.dni}
												</Typography>
											</TableCell>
											<TableCell>
												<Typography variant="body2" color="text.secondary">
													#{socio.numero_socio}
												</Typography>
											</TableCell>
											<TableCell>
												<Chip
													size="small"
													label={socio.estado === 'activo' ? 'Activo' : 'Inactivo'}
													color={socio.estado === 'activo' ? 'success' : 'default'}
													variant="outlined"
												/>
											</TableCell>
											<TableCell>
												<Chip
													size="small"
													variant="outlined"
													color={socio.es_moroso ? 'warning' : 'default'}
													label={socio.es_moroso ? 'Moroso' : 'Al día'}
												/>
												{socio.email_invalido && (
													<Typography variant="caption" sx={{ display: 'block' }} color="error">
														Correo inválido
													</Typography>
												)}
											</TableCell>
											<TableCell align="right">
												{monedaSocios.format(socio.deuda_pendiente)}
											</TableCell>
											<TableCell>
												<Button component={Link} to={`/socios/${socio.id}`}>
													Ver ficha
												</Button>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</TableContainer>
					)}
					<Box
						component="nav"
						aria-label="Páginas de socios"
						sx={{
							mt: 2,
							display: 'flex',
							gap: 1.5,
							alignItems: 'center',
							flexWrap: 'wrap',
							justifyContent: 'flex-end',
						}}
					>
						<Button disabled={page <= 1} onClick={() => changePage(page - 1)}>
							Anterior
						</Button>
						<Typography variant="body2" color="text.secondary" aria-live="polite">
							Página {page} de {result.totalPages} · {result.total}{' '}
							{result.total === 1 ? 'socio' : 'socios'}
						</Typography>
						<Button disabled={page >= result.totalPages} onClick={() => changePage(page + 1)}>
							Siguiente
						</Button>
					</Box>
				</>
			)}
			{selected && (
				<Box sx={{ mt: 3, pt: 3, borderTop: 1, borderColor: 'divider' }}>
					<Alert
						severity={recent?.kind === 'created' ? 'success' : 'info'}
						action={<Button onClick={clearSelection}>Limpiar selección</Button>}
					>
						{recent?.kind === 'created'
							? 'Alta confirmada. '
							: recent?.kind === 'verified'
								? 'Registro existente verificado. '
								: ''}
						Socio seleccionado: {selected.apellido}, {selected.nombre} · N.º {selected.numero_socio}{' '}
						· DNI {selected.dni}
						{recent?.kind === 'verified' && (
							<Box>
								Se seleccionó el registro encontrado por DNI; esto no confirma que el intento de
								alta lo haya creado.
							</Box>
						)}
						{recent && !visibleSelected && (
							<Box>
								{result
									? 'Este socio está fuera de esta página o búsqueda y sigue seleccionado.'
									: 'La selección reciente se conserva mientras se recupera el listado.'}
							</Box>
						)}
					</Alert>
					<Button
						variant="contained"
						disabled={selected.estado !== 'activo' || !enabled}
						onClick={() => {
							setInscripcionTarget(selected);
							setInscripcionOpen(true);
						}}
						sx={{ mt: 2 }}
					>
						Inscribir socio
					</Button>
					{selected.estado !== 'activo' && (
						<Typography color="text.secondary">
							El socio debe estar activo para inscribirlo.
						</Typography>
					)}
					<Button component={Link} to={`/socios/${selected.id}`} sx={{ mt: 2, ml: 1 }}>
						Abrir ficha
					</Button>
					{renderSelectedSocio?.(selected)}
				</Box>
			)}
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
		</Paper>
	);
}
