import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import {
	Alert,
	Box,
	Button,
	Chip,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Divider,
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
	mensajeAltaGasto,
	monedaGasto,
	puedeAnularGasto,
	puedeEditarGasto,
} from '#entities/gasto';
import { useAuth } from '#entities/session';
import { AnularGastoDialog } from '#features/anular-gasto';
import { CreateGastoDialog } from '#features/create-gasto';
import { EditGastoDialog } from '#features/edit-gasto';
import { GastoEvidencia } from '#features/gasto-evidencia';

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
const fechaVisible = (date: string) =>
	new Intl.DateTimeFormat('es-AR', {
		dateStyle: 'short',
		timeZone: 'America/Argentina/Buenos_Aires',
	}).format(new Date(`${date}T12:00:00Z`));
const instante = (date: string) =>
	new Intl.DateTimeFormat('es-AR', {
		dateStyle: 'short',
		timeStyle: 'short',
		timeZone: 'America/Argentina/Buenos_Aires',
	}).format(new Date(date));
export function GastosPanel() {
	const { cacheScope } = useAuth();
	return <Panel key={cacheScope} />;
}
function Panel() {
	const { cacheScope, profileStatus, perfil, isSigningOut } = useAuth();
	const enabled = profileStatus === 'ready' && !isSigningOut;
	const [searchParams, setSearchParams] = useSearchParams();
	const selectedId = searchParams.get('gastoId');
	const [filters, setFilters] = useState<FiltrosGasto>(initial);
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
	const dateError = Boolean(filters.desde && filters.hasta && filters.desde > filters.hasta);
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
	const sort = (orden: FiltrosGasto['orden']) =>
		filter({ orden, ascendente: filters.orden === orden ? !filters.ascendente : true });
	const headers: [string, FiltrosGasto['orden'] | null][] = [
		['Fecha', 'fecha'],
		['Categoría', null],
		['Concepto / Descripción', 'concepto'],
		['Importe', 'monto'],
		['Método', 'metodo_pago'],
		['Referencia / Banco', null],
		['Estado', 'estado'],
		['Acciones', null],
	];
	return (
		<Stack spacing={2.5}>
			{feedback && (
				<Alert severity="success" onClose={() => setFeedback(null)}>
					{feedback}
				</Alert>
			)}
			<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
				<Stack spacing={2.5}>
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
								La fecha del gasto y su día de carga pueden ser distintos.
							</Typography>
						</Box>
						<Button
							variant="contained"
							startIcon={<AddOutlinedIcon />}
							disabled={!enabled || !hoy.data}
							onClick={() => setCreating(true)}
						>
							Registrar gasto
						</Button>
					</Stack>
					<Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
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
						<TextField
							select
							size="small"
							label="Categoría"
							value={filters.categoriaId}
							onChange={(e) => filter({ categoriaId: e.target.value })}
							sx={{ minWidth: 170 }}
						>
							<MenuItem value="">Todas</MenuItem>
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
							label="Método"
							value={filters.metodo}
							onChange={(e) => filter({ metodo: e.target.value })}
							sx={{ minWidth: 150 }}
						>
							<MenuItem value="todos">Todos</MenuItem>
							<MenuItem value="efectivo">Efectivo</MenuItem>
							<MenuItem value="transferencia">Transferencia</MenuItem>
						</TextField>
						<TextField
							select
							size="small"
							label="Estado"
							value={filters.estado}
							onChange={(e) => filter({ estado: e.target.value })}
							sx={{ minWidth: 130 }}
						>
							<MenuItem value="todos">Todos</MenuItem>
							<MenuItem value="activo">Activo</MenuItem>
							<MenuItem value="anulado">Anulado</MenuItem>
						</TextField>
					</Stack>
					<TextField
						label="Buscar en concepto o descripción"
						size="small"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
					{hoy.isError && (
						<Alert
							severity="warning"
							action={<Button onClick={() => void hoy.refetch()}>Reintentar</Button>}
						>
							No pudimos consultar la fecha del club. Las acciones se habilitarán al recuperarla.
						</Alert>
					)}
					{categories.isError && (
						<Alert
							severity="warning"
							action={<Button onClick={() => void categories.refetch()}>Reintentar</Button>}
						>
							No pudimos cargar el filtro de categorías.
						</Alert>
					)}
					{dateError ? (
						<Alert severity="warning">La fecha Desde debe ser anterior o igual a Hasta.</Alert>
					) : list.isError ? (
						<Alert
							severity="error"
							action={<Button onClick={() => void list.refetch()}>Reintentar</Button>}
						>
							No pudimos consultar los gastos.
						</Alert>
					) : (
						<>
							<TableContainer>
								<Table size="small" aria-label="Historial de gastos">
									<TableHead>
										<TableRow>
											{headers.map(([label, field]) => (
												<TableCell key={label}>
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
												<TableCell colSpan={8}>Cargando gastos…</TableCell>
											</TableRow>
										) : !list.data?.gastos.length ? (
											<TableRow>
												<TableCell colSpan={8}>
													No se encontraron gastos para estos filtros.
												</TableCell>
											</TableRow>
										) : (
											list.data.gastos.map((g) => (
												<TableRow key={g.id}>
													<TableCell sx={{ whiteSpace: 'nowrap' }}>
														{fechaVisible(g.fecha)}
													</TableCell>
													<TableCell>{g.categoria?.nombre ?? 'Categoría no disponible'}</TableCell>
													<TableCell>
														<Typography variant="body2" sx={{ fontWeight: 600 }}>
															{g.concepto}
														</Typography>
														{g.descripcion && (
															<Typography variant="caption" color="text.secondary">
																{g.descripcion}
															</Typography>
														)}
													</TableCell>
													<TableCell sx={{ whiteSpace: 'nowrap' }}>
														{monedaGasto(g.monto)}
													</TableCell>
													<TableCell>
														{g.metodo_pago === 'efectivo' ? 'Efectivo' : 'Transferencia'}
													</TableCell>
													<TableCell>{g.referencia_banco ?? '—'}</TableCell>
													<TableCell>
														<Chip
															size="small"
															variant="outlined"
															label={g.estado === 'activo' ? 'Activo' : 'Anulado'}
															color={g.estado === 'activo' ? 'success' : 'default'}
														/>
													</TableCell>
													<TableCell>
														<Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
															<Button size="small" onClick={() => open(g.id)}>
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
								page={filters.pagina}
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
			<Dialog open={!!selectedId} fullWidth maxWidth="md" onClose={() => open(null)}>
				<DialogTitle>Detalle del gasto</DialogTitle>
				<DialogContent>
					{detail.isPending ? (
						<Typography>Cargando detalle…</Typography>
					) : detail.isError ? (
						<Alert
							severity="error"
							action={<Button onClick={() => void detail.refetch()}>Reintentar</Button>}
						>
							No pudimos consultar el gasto.
						</Alert>
					) : !detail.data ? (
						<Alert severity="info">No encontramos ese gasto.</Alert>
					) : (
						<Stack spacing={2.5} sx={{ pt: 1 }}>
							<Box>
								<Typography component="h3" variant="h6">
									{detail.data.concepto}
								</Typography>
								<Typography color="text.secondary">
									{detail.data.categoria?.nombre ?? 'Categoría no disponible'} ·{' '}
									{monedaGasto(detail.data.monto)}
								</Typography>
							</Box>
							<Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
								<Typography>Fecha del gasto: {fechaVisible(detail.data.fecha)}</Typography>
								<Typography>Cargado: {instante(detail.data.created_at)}</Typography>
							</Stack>
							<Typography>
								Medio: {detail.data.metodo_pago === 'efectivo' ? 'Efectivo' : 'Transferencia'} ·
								Referencia: {detail.data.referencia_banco ?? '—'}
							</Typography>
							{detail.data.descripcion && (
								<Typography sx={{ whiteSpace: 'pre-wrap' }}>{detail.data.descripcion}</Typography>
							)}
							{detail.data.estado === 'anulado' && (
								<Alert severity="info">
									Anulado el {detail.data.anulado_at ? instante(detail.data.anulado_at) : '—'}.
									Motivo: {detail.data.motivo_anulacion}
								</Alert>
							)}
							<Divider />
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
