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
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	TextField,
	Typography,
} from '@mui/material';
import { type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '#entities/session';
import { type SocioListado, useSocios } from '#entities/socio';
import { CreateSocioDialog } from '#features/create-socio';
import { InscribirSocioDialog } from '#features/inscribir-socio';
import { useDebounce } from '#shared/lib/useDebounce';

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
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const [searchTerm, setSearchTerm] = useState('');
	const [estado, setEstado] = useState<'activo' | 'inactivo' | 'todos'>('activo');
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
		{ cacheScope, enabled: enabled && !filtering, estado },
	);
	const loading = !enabled || isPending || isFetching || filtering;
	const result = !loading && !isError ? data : undefined;
	const visibleSelected = result?.socios.find((socio) => socio.id === selectedSocio?.id);
	const recent = recentSelection?.socio.id === selectedSocio?.id ? recentSelection : null;
	const selected = enabled ? (visibleSelected ?? recent?.socio) : undefined;

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
					label="Buscar por apellido"
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
								? 'No se encontraron socios para este apellido.'
								: 'Todavía no hay socios para mostrar.'}
						</Alert>
					) : (
						<TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
							<Table size="small" aria-label="Listado de socios">
								<TableHead>
									<TableRow>
										<TableCell sx={{ width: 72 }}>Seleccionar</TableCell>
										<TableCell>Socio</TableCell>
										<TableCell>Matrícula</TableCell>
										<TableCell>Estado</TableCell>
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
