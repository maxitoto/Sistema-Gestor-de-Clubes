import {
	Alert,
	Box,
	Button,
	Chip,
	LinearProgress,
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
	Tooltip,
	Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
	type CriteriosCaja,
	claveMovimientoCaja,
	criteriosCajaIniciales,
	fechaCajaValida,
	formatearImporteCaja,
	type MovimientoCaja,
	urlOrigenCaja,
	useCaja,
	usePeriodoCajaActual,
} from '#entities/movimiento-caja';
import { useAuth } from '#entities/session';

const datetime = new Intl.DateTimeFormat('es-AR', {
	dateStyle: 'short',
	timeStyle: 'short',
	timeZone: 'America/Argentina/Buenos_Aires',
});
function date(value: string) {
	return value.slice(0, 10).split('-').reverse().join('/');
}
function fechaMovimiento(row: MovimientoCaja) {
	return row.origen === 'gasto' && !row.esReverso && row.fechaNegocio
		? date(row.fechaNegocio)
		: datetime.format(new Date(row.fecha));
}
export function CajaPanel({ periodo }: { periodo?: { desde: string; hasta: string } } = {}) {
	const { cacheScope, profileStatus } = useAuth();
	return (
		<CajaContent
			key={cacheScope}
			scope={cacheScope}
			enabled={profileStatus === 'ready'}
			periodoFijo={periodo}
		/>
	);
}
function CajaContent({
	scope,
	enabled,
	periodoFijo,
}: {
	scope: string;
	enabled: boolean;
	periodoFijo?: { desde: string; hasta: string } | undefined;
}) {
	const periodo = usePeriodoCajaActual({ cacheScope: scope, enabled: enabled && !periodoFijo });
	const [criteria, setCriteria] = useState<CriteriosCaja>({
		...criteriosCajaIniciales,
		...periodoFijo,
	});
	const [initialized, setInitialized] = useState(!!periodoFijo);
	const [search, setSearch] = useState('');
	const desdeFijo = periodoFijo?.desde,
		hastaFijo = periodoFijo?.hasta;
	useEffect(() => {
		if (desdeFijo !== undefined && hastaFijo !== undefined) {
			setCriteria((x) => ({ ...x, desde: desdeFijo, hasta: hastaFijo, pagina: 0 }));
			setInitialized(true);
		}
	}, [desdeFijo, hastaFijo]);
	useEffect(() => {
		if (periodo.data && !initialized) {
			setCriteria((old) => ({ ...old, ...periodo.data }));
			setInitialized(true);
		}
	}, [periodo.data, initialized]);
	useEffect(() => {
		const timer = setTimeout(
			() =>
				setCriteria((old) => (old.texto === search ? old : { ...old, texto: search, pagina: 0 })),
			300,
		);
		return () => clearTimeout(timer);
	}, [search]);
	const invalidDate =
		(criteria.desde !== '' && !fechaCajaValida(criteria.desde)) ||
		(criteria.hasta !== '' && !fechaCajaValida(criteria.hasta)) ||
		(criteria.desde !== '' && criteria.hasta !== '' && criteria.desde > criteria.hasta);
	const query = useCaja(criteria, {
		cacheScope: scope,
		enabled: enabled && initialized && !invalidDate,
	});
	useEffect(() => {
		if (query.data) {
			const last = Math.max(0, Math.ceil(query.data.total / criteria.limite) - 1);
			if (criteria.pagina > last) {
				setCriteria((old) => ({ ...old, pagina: last }));
			}
		}
	}, [query.data, criteria.limite, criteria.pagina]);
	const change = <K extends keyof CriteriosCaja>(key: K, value: CriteriosCaja[K]) =>
		setCriteria((old) => ({ ...old, [key]: value, pagina: 0 }));
	const sort = (order: CriteriosCaja['orden']) =>
		setCriteria((old) => ({
			...old,
			orden: order,
			direccion: old.orden === order && old.direccion === 'asc' ? 'desc' : 'asc',
			pagina: 0,
		}));
	const header = (label: string, order: CriteriosCaja['orden']) => (
		<TableSortLabel
			active={criteria.orden === order}
			direction={criteria.orden === order ? criteria.direccion : 'asc'}
			onClick={() => sort(order)}
		>
			{label}
		</TableSortLabel>
	);
	if (!periodoFijo && periodo.isError) {
		return (
			<Alert
				severity="error"
				action={<Button onClick={() => void periodo.refetch()}>Reintentar</Button>}
			>
				No pudimos consultar el período del club.
			</Alert>
		);
	}
	return (
		<Stack spacing={2}>
			<Box>
				<Typography component="h2" variant="h6">
					Movimientos del club
				</Typography>
				<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
					Ingresos, egresos y anulaciones, con sus fechas efectivas.
				</Typography>
			</Box>
			<Paper variant="outlined" sx={{ p: 2 }}>
				<Stack spacing={2}>
					<Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
						<TextField
							size="small"
							type="date"
							label="Desde"
							value={criteria.desde}
							onChange={(e) => change('desde', e.target.value)}
							disabled={!initialized || !!periodoFijo}
							slotProps={{ inputLabel: { shrink: true } }}
						/>
						<TextField
							size="small"
							type="date"
							label="Hasta"
							value={criteria.hasta}
							onChange={(e) => change('hasta', e.target.value)}
							disabled={!initialized || !!periodoFijo}
							slotProps={{ inputLabel: { shrink: true } }}
						/>
						<TextField
							size="small"
							label="Buscar concepto o referencia"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							disabled={!initialized}
							sx={{ flex: 1 }}
							slotProps={{ htmlInput: { maxLength: 255 } }}
						/>
					</Stack>
					<Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 2 }}>
						<TextField
							size="small"
							select
							label="Movimiento"
							value={criteria.tipo}
							onChange={(e) => change('tipo', e.target.value as CriteriosCaja['tipo'])}
							sx={{ minWidth: 150 }}
						>
							<MenuItem value="todos">Todos</MenuItem>
							<MenuItem value="ingreso">Ingreso</MenuItem>
							<MenuItem value="egreso">Egreso</MenuItem>
						</TextField>
						<TextField
							size="small"
							select
							label="Origen"
							value={criteria.origen}
							onChange={(e) => change('origen', e.target.value as CriteriosCaja['origen'])}
							sx={{ minWidth: 150 }}
						>
							<MenuItem value="todos">Todos</MenuItem>
							<MenuItem value="cobro">Cobro</MenuItem>
							<MenuItem value="gasto">Gasto</MenuItem>
						</TextField>
						<TextField
							size="small"
							select
							label="Método"
							value={criteria.metodo}
							onChange={(e) => change('metodo', e.target.value as CriteriosCaja['metodo'])}
							sx={{ minWidth: 160 }}
						>
							<MenuItem value="todos">Todos</MenuItem>
							<MenuItem value="efectivo">Efectivo</MenuItem>
							<MenuItem value="transferencia">Transferencia</MenuItem>
						</TextField>
						<TextField
							size="small"
							select
							label="Registros"
							value={criteria.reversos}
							onChange={(e) => change('reversos', e.target.value as CriteriosCaja['reversos'])}
							sx={{ minWidth: 170 }}
						>
							<MenuItem value="todos">Originales y reversos</MenuItem>
							<MenuItem value="originales">Sólo originales</MenuItem>
							<MenuItem value="reversos">Sólo reversos</MenuItem>
						</TextField>
						<TextField
							size="small"
							select
							label="Estado de origen"
							value={criteria.estado}
							onChange={(e) => change('estado', e.target.value as CriteriosCaja['estado'])}
							sx={{ minWidth: 170 }}
						>
							<MenuItem value="todos">Todos</MenuItem>
							<MenuItem value="vigente">Vigente</MenuItem>
							<MenuItem value="anulado">Anulado</MenuItem>
						</TextField>
						<Button
							onClick={() => {
								setSearch('');
								setCriteria({ ...criteriosCajaIniciales, ...periodo.data, ...periodoFijo });
							}}
							disabled={!initialized}
						>
							Restablecer filtros
						</Button>
					</Stack>
				</Stack>
			</Paper>
			{invalidDate ? (
				<Alert severity="warning">
					Revisá el rango de fechas. Desde no puede ser posterior a Hasta.
				</Alert>
			) : (
				<>
					{query.data?.totales && (
						<Paper variant="outlined" sx={{ p: 2, borderLeft: 4, borderLeftColor: 'primary.main' }}>
							<Typography variant="body2" color="text.secondary">
								Resultado neto del conjunto filtrado
							</Typography>
							<Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>
								{formatearImporteCaja(query.data.totales.neto)}
							</Typography>
							<Typography variant="caption" color="text.secondary">
								Entradas {formatearImporteCaja(query.data.totales.ingresos)} · Salidas{' '}
								{formatearImporteCaja(query.data.totales.egresos)}. Incluye los reversos que
								coinciden con los filtros y todas las páginas.
							</Typography>
						</Paper>
					)}
					{query.isError ? (
						<Alert
							severity="error"
							action={<Button onClick={() => void query.refetch()}>Reintentar</Button>}
						>
							No pudimos consultar los movimientos. Volvé a intentarlo.
						</Alert>
					) : (
						<Paper variant="outlined" sx={{ overflow: 'hidden' }}>
							{query.isFetching && <LinearProgress aria-label="Actualizando movimientos" />}
							<TableContainer>
								<Table size="small" aria-label="Libro mayor de movimientos" sx={{ minWidth: 950 }}>
									<TableHead>
										<TableRow>
											<TableCell>{header('Fecha efectiva', 'fecha')}</TableCell>
											<TableCell>{header('Tipo', 'tipo')}</TableCell>
											<TableCell>{header('Concepto', 'concepto')}</TableCell>
											<TableCell align="right">{header('Importe', 'monto')}</TableCell>
											<TableCell>{header('Método', 'metodo')}</TableCell>
											<TableCell>Referencia</TableCell>
											<TableCell>Registrado por</TableCell>
											<TableCell>{header('Estado de origen', 'estado')}</TableCell>
											<TableCell>Detalle</TableCell>
										</TableRow>
									</TableHead>
									<TableBody>
										{!initialized || query.isPending ? (
											<TableRow>
												<TableCell colSpan={9}>Cargando movimientos…</TableCell>
											</TableRow>
										) : !query.data?.filas.length ? (
											<TableRow>
												<TableCell colSpan={9}>
													No se encontraron movimientos que coincidan con la búsqueda.
												</TableCell>
											</TableRow>
										) : (
											query.data.filas.map((row) => (
												<TableRow key={claveMovimientoCaja(row)}>
													<TableCell>
														<Typography variant="body2">{fechaMovimiento(row)}</Typography>
														<Typography variant="caption" color="text.secondary">
															{row.esReverso
																? 'Anulación'
																: row.origen === 'gasto'
																	? 'Fecha del gasto'
																	: 'Fecha del cobro'}
														</Typography>
													</TableCell>
													<TableCell>
														<Chip
															size="small"
															variant="outlined"
															color={row.tipo === 'ingreso' ? 'success' : 'default'}
															label={row.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
														/>
														{row.esReverso && (
															<Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
																Reverso
															</Typography>
														)}
													</TableCell>
													<TableCell>{row.concepto}</TableCell>
													<TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
														{row.tipo === 'ingreso' ? '+ ' : '- '}
														{formatearImporteCaja(row.monto)}
													</TableCell>
													<TableCell>
														{row.metodo === 'efectivo' ? 'Efectivo' : 'Transferencia'}
													</TableCell>
													<TableCell>{row.referencia || '—'}</TableCell>
													<TableCell>
														<Tooltip
															title={
																row.cargadoEn
																	? `Carga original: ${datetime.format(new Date(row.cargadoEn))}`
																	: ''
															}
														>
															<Typography variant="body2">{row.autor}</Typography>
														</Tooltip>
													</TableCell>
													<TableCell>
														{row.estado === 'anulado'
															? 'Anulado'
															: row.estado === 'activo'
																? 'Activo'
																: 'Confirmado'}
													</TableCell>
													<TableCell>
														<Button size="small" component={Link} to={urlOrigenCaja(row)}>
															Ver {row.origen === 'cobro' ? 'cobro' : 'gasto'}
														</Button>
													</TableCell>
												</TableRow>
											))
										)}
									</TableBody>
								</Table>
							</TableContainer>
							<TablePagination
								component="div"
								count={query.data?.total ?? 0}
								page={criteria.pagina}
								rowsPerPage={criteria.limite}
								rowsPerPageOptions={[20, 50, 100]}
								onPageChange={(_, pagina) => setCriteria((old) => ({ ...old, pagina }))}
								onRowsPerPageChange={(e) =>
									change('limite', Number(e.target.value) as CriteriosCaja['limite'])
								}
								labelRowsPerPage="Filas por página"
								labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
							/>
						</Paper>
					)}
				</>
			)}
		</Stack>
	);
}
