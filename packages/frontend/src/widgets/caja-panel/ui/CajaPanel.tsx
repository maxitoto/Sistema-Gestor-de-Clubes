import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import {
	Alert,
	Box,
	Button,
	Chip,
	CircularProgress,
	InputAdornment,
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
import { DateRangePresets, EmptyState, InfoTooltip, KpiCard } from '#shared/ui';

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

export function CajaPanel({
	periodo,
	periodoInicial,
	onRestablecerPeriodo,
	embedded = false,
}: {
	periodo?: { desde: string; hasta: string };
	periodoInicial?: { desde: string; hasta: string };
	onRestablecerPeriodo?: () => void;
	embedded?: boolean;
} = {}) {
	const { cacheScope, profileStatus } = useAuth();
	return (
		<CajaContent
			key={cacheScope}
			scope={cacheScope}
			enabled={profileStatus === 'ready'}
			periodoFijo={periodo}
			periodoInicial={periodoInicial}
			onRestablecerPeriodo={onRestablecerPeriodo}
			embedded={embedded}
		/>
	);
}

function CajaContent({
	scope,
	enabled,
	periodoFijo,
	periodoInicial,
	onRestablecerPeriodo,
	embedded,
}: {
	scope: string;
	enabled: boolean;
	periodoFijo?: { desde: string; hasta: string } | undefined;
	periodoInicial?: { desde: string; hasta: string } | undefined;
	onRestablecerPeriodo?: (() => void) | undefined;
	embedded: boolean;
}) {
	const periodo = usePeriodoCajaActual({ cacheScope: scope, enabled: enabled && !periodoFijo });
	const [criteria, setCriteria] = useState<CriteriosCaja>({
		...criteriosCajaIniciales,
		...(periodoFijo ?? periodoInicial),
	});
	const [initialized, setInitialized] = useState(Boolean(periodoFijo || periodoInicial));
	const [search, setSearch] = useState('');
	const desdeFijo = periodoFijo?.desde,
		hastaFijo = periodoFijo?.hasta,
		desdeInicial = periodoInicial?.desde,
		hastaInicial = periodoInicial?.hasta;

	useEffect(() => {
		if (desdeFijo !== undefined && hastaFijo !== undefined) {
			setCriteria((x) => ({ ...x, desde: desdeFijo, hasta: hastaFijo, pagina: 0 }));
			setInitialized(true);
		}
	}, [desdeFijo, hastaFijo]);

	useEffect(() => {
		if (!periodoFijo && (desdeInicial !== undefined || hastaInicial !== undefined)) {
			setCriteria((x) => ({
				...x,
				desde: desdeInicial ?? '',
				hasta: hastaInicial ?? '',
				pagina: 0,
			}));
			setInitialized(true);
		}
	}, [periodoFijo, desdeInicial, hastaInicial]);

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

	const resetFilters = () => {
		setSearch('');
		if (periodoFijo) {
			setCriteria({ ...criteriosCajaIniciales, ...periodoFijo });
			return;
		}
		setCriteria({ ...criteriosCajaIniciales, ...periodo.data });
		onRestablecerPeriodo?.();
	};

	if (!periodoFijo && !initialized && periodo.isError) {
		return (
			<Alert
				severity="error"
				action={
					<Button size="small" color="inherit" onClick={() => void periodo.refetch()}>
						Reintentar
					</Button>
				}
			>
				No pudimos consultar el período del club.
			</Alert>
		);
	}

	const netoNum = query.data?.totales ? Number(query.data.totales.neto) : 0;

	return (
		<Stack spacing={2.5}>
			{!embedded && (
				<Box>
					<Typography component="h2" variant="h6">
						Libro de movimientos
					</Typography>
					<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
						Ingresos, egresos y anulaciones con sus fechas efectivas.
					</Typography>
				</Box>
			)}

			{!invalidDate && query.data?.totales && (
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
						gap: 2,
					}}
				>
					<KpiCard
						label="Resultado neto (consulta actual)"
						value={formatearImporteCaja(query.data.totales.neto)}
						caption="Incluye anulaciones y todas las páginas del filtro activo."
						tone={netoNum > 0 ? 'success' : netoNum < 0 ? 'error' : 'primary'}
						trailing={
							<InfoTooltip
								label="Cálculo del resultado neto"
								title="Suma los ingresos y resta los egresos que coinciden con estos filtros, incluidas las anulaciones según su fecha efectiva."
							/>
						}
					/>
					<KpiCard
						label="Ingresos"
						value={formatearImporteCaja(query.data.totales.ingresos)}
						caption="Cobros y anulaciones de gastos en este filtro."
						tone="success"
					/>
					<KpiCard
						label="Egresos"
						value={formatearImporteCaja(query.data.totales.egresos)}
						caption="Gastos y anulaciones de cobros en este filtro."
						tone="neutral"
					/>
				</Box>
			)}

			<Paper variant="outlined" sx={{ p: 2 }}>
				<Stack spacing={2}>
					{!periodoFijo && (
						<DateRangePresets
							label="Fecha efectiva"
							desde={criteria.desde}
							hasta={criteria.hasta}
							disabled={!initialized}
							onSelect={({ desde, hasta }) =>
								setCriteria((old) => ({ ...old, desde, hasta, pagina: 0 }))
							}
						/>
					)}

					<Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
						<TextField
							size="small"
							label="Buscar concepto o referencia"
							placeholder="Ej. cuota, electricidad, transferencia…"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							disabled={!initialized}
							sx={{ flex: 1, minWidth: 220 }}
							slotProps={{
								htmlInput: { maxLength: 255 },
								input: {
									startAdornment: (
										<InputAdornment position="start">
											<SearchOutlinedIcon fontSize="small" color="action" />
										</InputAdornment>
									),
								},
							}}
						/>
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
					</Stack>

					<Stack
						direction="row"
						spacing={1.5}
						useFlexGap
						sx={{ flexWrap: 'wrap', alignItems: 'center' }}
					>
						<TextField
							size="small"
							select
							label="Tipo"
							value={criteria.tipo}
							onChange={(e) => change('tipo', e.target.value as CriteriosCaja['tipo'])}
							sx={{ minWidth: 140 }}
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
							sx={{ minWidth: 140 }}
						>
							<MenuItem value="todos">Todos</MenuItem>
							<MenuItem value="cobro">Cobro</MenuItem>
							<MenuItem value="gasto">Gasto</MenuItem>
						</TextField>
						<TextField
							size="small"
							select
							label="Medio de pago"
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
							label="Asientos"
							value={criteria.reversos}
							onChange={(e) => change('reversos', e.target.value as CriteriosCaja['reversos'])}
							sx={{ minWidth: 190 }}
						>
							<MenuItem value="todos">Originales y anulaciones</MenuItem>
							<MenuItem value="originales">Solo originales</MenuItem>
							<MenuItem value="reversos">Solo anulaciones</MenuItem>
						</TextField>
						<TextField
							size="small"
							select
							label="Estado de origen"
							value={criteria.estado}
							onChange={(e) => change('estado', e.target.value as CriteriosCaja['estado'])}
							sx={{ minWidth: 160 }}
						>
							<MenuItem value="todos">Todos</MenuItem>
							<MenuItem value="vigente">Vigente</MenuItem>
							<MenuItem value="anulado">Anulado</MenuItem>
						</TextField>
						<Button size="small" color="inherit" onClick={resetFilters} disabled={!initialized}>
							Limpiar filtros
						</Button>
					</Stack>
				</Stack>
			</Paper>

			{invalidDate ? (
				<Alert severity="warning">
					Revisá el rango de fechas: la fecha inicial no puede ser posterior a la final.
				</Alert>
			) : query.isError ? (
				<Alert
					severity="error"
					action={
						<Button size="small" color="inherit" onClick={() => void query.refetch()}>
							Reintentar
						</Button>
					}
				>
					No pudimos consultar los movimientos. Volvé a intentarlo.
				</Alert>
			) : (
				<Paper variant="outlined" sx={{ overflow: 'hidden' }}>
					{query.isFetching && <LinearProgress aria-label="Actualizando movimientos" />}
					<TableContainer>
						<Table size="small" aria-label="Libro mayor de movimientos" sx={{ minWidth: 940 }}>
							<TableHead>
								<TableRow>
									<TableCell>{header('Fecha efectiva', 'fecha')}</TableCell>
									<TableCell>{header('Tipo', 'tipo')}</TableCell>
									<TableCell>{header('Concepto', 'concepto')}</TableCell>
									<TableCell align="right">{header('Importe', 'monto')}</TableCell>
									<TableCell>{header('Medio de pago', 'metodo')}</TableCell>
									<TableCell>Referencia</TableCell>
									<TableCell>Registrado por</TableCell>
									<TableCell>{header('Estado de origen', 'estado')}</TableCell>
									<TableCell align="right">Detalle</TableCell>
								</TableRow>
							</TableHead>
							<TableBody>
								{!initialized || query.isPending ? (
									<TableRow>
										<TableCell colSpan={9} sx={{ py: 5 }}>
											<Stack
												direction="row"
												spacing={1.5}
												sx={{ justifyContent: 'center', alignItems: 'center' }}
											>
												<CircularProgress size={20} />
												<Typography variant="body2" color="text.secondary">
													Cargando movimientos…
												</Typography>
											</Stack>
										</TableCell>
									</TableRow>
								) : !query.data?.filas.length ? (
									<TableRow>
										<TableCell colSpan={9} sx={{ borderBottom: 0 }}>
											<EmptyState
												title="No encontramos movimientos para estos filtros"
												description="Probá ampliando el rango de fechas o restableciendo los filtros activos."
												action={
													<Button variant="outlined" size="small" onClick={resetFilters}>
														Limpiar filtros
													</Button>
												}
											/>
										</TableCell>
									</TableRow>
								) : (
									query.data.filas.map((row) => (
										<TableRow key={claveMovimientoCaja(row)}>
											<TableCell sx={{ whiteSpace: 'nowrap' }}>
												<Typography
													variant="body2"
													sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}
												>
													{fechaMovimiento(row)}
												</Typography>
												<Typography variant="caption" color="text.secondary">
													{row.esReverso
														? 'Fecha de anulación'
														: row.origen === 'gasto'
															? 'Fecha del gasto'
															: 'Fecha del cobro'}
												</Typography>
											</TableCell>
											<TableCell>
												<Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
													<Chip
														size="small"
														color={row.tipo === 'ingreso' ? 'success' : 'default'}
														label={row.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
													/>
													{row.esReverso && (
														<Chip size="small" variant="outlined" label="Anulación" />
													)}
												</Stack>
											</TableCell>
											<TableCell>{row.concepto}</TableCell>
											<TableCell
												align="right"
												sx={{
													whiteSpace: 'nowrap',
													fontWeight: 600,
													fontVariantNumeric: 'tabular-nums',
													color: row.tipo === 'ingreso' ? 'success.main' : 'text.primary',
												}}
											>
												{row.tipo === 'ingreso' ? '+ ' : '- '}
												{formatearImporteCaja(row.monto)}
											</TableCell>
											<TableCell sx={{ whiteSpace: 'nowrap' }}>
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
											<TableCell sx={{ whiteSpace: 'nowrap' }}>
												<Chip
													size="small"
													variant="outlined"
													color={row.estado === 'anulado' ? 'default' : 'success'}
													label={
														row.estado === 'anulado'
															? 'Anulado'
															: row.estado === 'activo'
																? 'Vigente'
																: 'Confirmado'
													}
												/>
											</TableCell>
											<TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
												<Button
													size="small"
													variant="outlined"
													component={Link}
													to={urlOrigenCaja(row)}
												>
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
						page={Math.min(
							criteria.pagina,
							Math.max(0, Math.ceil((query.data?.total ?? 0) / criteria.limite) - 1),
						)}
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
		</Stack>
	);
}
