import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import {
	Alert,
	Box,
	Button,
	Chip,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
	type AccionMonitoreo,
	type CriteriosMonitoreo,
	criteriosMonitoreoIniciales,
	type FilaMonitoreo,
	getMonitoreoFiscal,
	puedeAccionFiscal,
	tituloAccionFiscal,
} from '#entities/monitoreo-fiscal';
import { useAuth } from '#entities/session';
import { FiscalComprobantePanel } from '#features/comprobante-fiscal';
import { AccionFiscalDialog } from '#features/regularizar-comprobante';
import { fechaCobranza, monedaCobranza } from '#shared/types/cobranza';
import { DateRangePresets, EmptyState, InfoTooltip, KpiCard, PageHeader } from '#shared/ui';

function chipEstadoFiscal(state: FilaMonitoreo['estadoFiscal']): {
	label: string;
	color: 'warning' | 'error';
} {
	if (state === 'fallido') {
		return { label: 'Error ARCA', color: 'error' };
	}
	if (state === 'anulacion_pendiente') {
		return { label: 'Anulación pendiente', color: 'warning' };
	}
	return { label: 'Pendiente ARCA', color: 'warning' };
}

export function MonitoreoFiscalPage() {
	const { cacheScope } = useAuth();
	return <MonitoreoPanel key={cacheScope} />;
}

function MonitoreoPanel() {
	const { perfil, cacheScope, profileStatus, isSigningOut } = useAuth(),
		actorId = perfil?.id ?? '',
		admin = perfil?.rol === 'admin';
	const [criteria, setCriteria] = useState<CriteriosMonitoreo>(criteriosMonitoreoIniciales),
		[search, setSearch] = useState(''),
		[detail, setDetail] = useState<FilaMonitoreo | null>(null),
		[action, setAction] = useState<{ fila: FilaMonitoreo; accion: AccionMonitoreo } | null>(null);
	const queryClient = useQueryClient();
	const enabled = profileStatus === 'ready' && !isSigningOut;
	const invalidDates = Boolean(criteria.desde && criteria.hasta && criteria.desde > criteria.hasta);
	const summaryCriteria: CriteriosMonitoreo = {
		...criteria,
		estado: 'todos',
		page: 1,
		pageSize: 20,
	};

	const query = useQuery({
		queryKey: ['monitoreo-fiscal', cacheScope, criteria],
		queryFn: ({ signal }) => getMonitoreoFiscal(criteria, actorId, signal),
		enabled: enabled && !invalidDates,
		retry: 1,
	});
	const summaryQuery = useQuery({
		queryKey: ['monitoreo-fiscal', cacheScope, summaryCriteria],
		queryFn: ({ signal }) => getMonitoreoFiscal(summaryCriteria, actorId, signal),
		enabled: enabled && !invalidDates && criteria.estado !== 'todos',
		placeholderData: (previousData) => previousData,
		staleTime: 30_000,
		retry: 1,
	});

	useEffect(() => {
		const timeout = setTimeout(() => setCriteria((c) => ({ ...c, q: search, page: 1 })), 300);
		return () => clearTimeout(timeout);
	}, [search]);

	useEffect(() => {
		if (query.data) {
			const last = Math.max(1, Math.ceil(query.data.total / criteria.pageSize));
			if (criteria.page > last) {
				setCriteria((c) => ({ ...c, page: last }));
			}
		}
	}, [query.data, criteria.page, criteria.pageSize]);

	const change = <K extends keyof CriteriosMonitoreo>(key: K, value: CriteriosMonitoreo[K]) =>
		setCriteria((c) => ({ ...c, [key]: value, page: 1 }));

	const toggleEstadoKpi = (target: Exclude<CriteriosMonitoreo['estado'], 'todos'>) =>
		change('estado', criteria.estado === target ? 'todos' : target);

	const clearFilters = () => {
		setCriteria(criteriosMonitoreoIniciales());
		setSearch('');
	};

	const refreshAll = () =>
		void queryClient.invalidateQueries({ queryKey: ['monitoreo-fiscal', cacheScope] });

	const refresh = () => {
		refreshAll();
		setDetail(null);
	};

	const hasAnyFilter =
		Boolean(search.trim()) ||
		criteria.estado !== 'todos' ||
		criteria.tipo !== 'todos' ||
		Boolean(criteria.desde || criteria.hasta);

	const buttons = (row: FilaMonitoreo) => (
		<Stack spacing={0.75} sx={{ alignItems: 'flex-end', minWidth: 160 }}>
			<Button size="small" variant="outlined" onClick={() => setDetail(row)}>
				Ver detalle fiscal
			</Button>
			{admin &&
				(['forzar', 'reabrir', 'resolver', 'registrar-externo'] as const).map((a) => {
					const key = a === 'registrar-externo' ? 'registrarExterno' : a;
					return row.acciones[key] ? (
						<Button
							size="small"
							key={a}
							disabled={!puedeAccionFiscal(row, a, admin, query.data?.externoHabilitado ?? false)}
							onClick={() => setAction({ fila: row, accion: a })}
						>
							{tituloAccionFiscal(a)}
						</Button>
					) : null;
				})}
		</Stack>
	);

	const conteos = criteria.estado === 'todos' ? query.data?.conteos : summaryQuery.data?.conteos;

	return (
		<Stack spacing={3}>
			<PageHeader
				back={
					<Button component={Link} to="/pagos" size="small" startIcon={<ArrowBackOutlinedIcon />}>
						Volver a Cobranza
					</Button>
				}
				title="Monitoreo fiscal"
				subtitle="Seguimiento de facturas y notas de crédito con autorización o anulación pendientes ante ARCA."
				actions={
					<Button
						variant="outlined"
						size="small"
						startIcon={<RefreshOutlinedIcon />}
						disabled={query.isFetching || summaryQuery.isFetching || invalidDates}
						onClick={refreshAll}
					>
						Actualizar
					</Button>
				}
			/>

			{query.data && !query.data.externoHabilitado && (
				<Alert
					severity="info"
					action={
						admin ? (
							<Button size="small" color="inherit" component={Link} to="/settings">
								Ir a Configuración
							</Button>
						) : undefined
					}
				>
					La conexión de homologación con ARCA todavía no está habilitada. Podés revisar las
					incidencias; las acciones que consultan ARCA se activarán al completar la configuración.
				</Alert>
			)}

			{!admin && (
				<Typography variant="body2" color="text.secondary">
					Tu perfil permite consultar el monitoreo. Las acciones de regularización requieren un
					Administrador.
				</Typography>
			)}

			{conteos && (
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
						gap: 2,
					}}
				>
					<KpiCard
						label="Pendientes de ARCA"
						value={String(conteos.pendientes)}
						caption="Aguardan autorización automática o manual."
						tone={conteos.pendientes > 0 ? 'warning' : 'success'}
						active={criteria.estado === 'pendiente_cae'}
						onClick={() => toggleEstadoKpi('pendiente_cae')}
					/>
					<KpiCard
						label="Con error ARCA"
						value={String(conteos.fallidos)}
						caption="Requieren revisión o reapertura de plazo."
						tone={conteos.fallidos > 0 ? 'error' : 'success'}
						active={criteria.estado === 'fallido'}
						onClick={() => toggleEstadoKpi('fallido')}
					/>
					<KpiCard
						label="Anulaciones pendientes"
						value={String(conteos.anulacionPendiente)}
						caption="Notas de Crédito o conciliaciones en espera."
						tone={conteos.anulacionPendiente > 0 ? 'warning' : 'success'}
						active={criteria.estado === 'anulacion_pendiente'}
						onClick={() => toggleEstadoKpi('anulacion_pendiente')}
					/>
				</Box>
			)}

			<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
				<Stack spacing={2.25}>
					<Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
						<TextField
							size="small"
							label="Buscar socio"
							placeholder="Apellido, nombre o DNI…"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							slotProps={{
								htmlInput: { maxLength: 100 },
								input: {
									startAdornment: (
										<InputAdornment position="start">
											<SearchOutlinedIcon fontSize="small" color="action" />
										</InputAdornment>
									),
								},
							}}
							sx={{ flex: 1, minWidth: 200 }}
						/>
						<TextField
							size="small"
							select
							label="Estado fiscal"
							value={criteria.estado}
							onChange={(e) => change('estado', e.target.value as CriteriosMonitoreo['estado'])}
							sx={{ minWidth: 190 }}
						>
							<MenuItem value="todos">Todas las incidencias</MenuItem>
							<MenuItem value="pendiente_cae">Pendiente ARCA</MenuItem>
							<MenuItem value="fallido">Error ARCA</MenuItem>
							<MenuItem value="anulacion_pendiente">Anulación pendiente</MenuItem>
						</TextField>
						<TextField
							size="small"
							select
							label="Comprobante"
							value={criteria.tipo}
							onChange={(e) => change('tipo', e.target.value as CriteriosMonitoreo['tipo'])}
							sx={{ minWidth: 170 }}
						>
							<MenuItem value="todos">Todos</MenuItem>
							<MenuItem value="factura">Factura C</MenuItem>
							<MenuItem value="nota_credito">Nota de Crédito C</MenuItem>
						</TextField>
						{hasAnyFilter && (
							<Button size="small" color="inherit" onClick={clearFilters}>
								Limpiar filtros
							</Button>
						)}
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
							label="Fecha del cobro"
							desde={criteria.desde}
							hasta={criteria.hasta}
							onSelect={({ desde, hasta }) => setCriteria((c) => ({ ...c, desde, hasta, page: 1 }))}
						/>
						<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
							<TextField
								size="small"
								label="Cobros desde"
								type="date"
								value={criteria.desde}
								onChange={(e) => change('desde', e.target.value)}
								slotProps={{ inputLabel: { shrink: true } }}
							/>
							<TextField
								size="small"
								label="Cobros hasta"
								type="date"
								value={criteria.hasta}
								onChange={(e) => change('hasta', e.target.value)}
								slotProps={{ inputLabel: { shrink: true } }}
							/>
						</Stack>
					</Stack>

					{invalidDates && (
						<Alert severity="warning">
							La fecha «Cobros desde» no puede ser posterior a «Cobros hasta».
						</Alert>
					)}

					{!invalidDates &&
						(query.isError ? (
							<Alert
								severity="warning"
								action={
									<Button size="small" color="inherit" onClick={() => void query.refetch()}>
										Reintentar
									</Button>
								}
							>
								No pudimos consultar el monitoreo fiscal. Revisá fechas, permisos y conexión.
							</Alert>
						) : (
							<>
								<TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
									<Table size="small" aria-label="Incidencias fiscales">
										<TableHead>
											<TableRow>
												<TableCell>Socio</TableCell>
												<TableCell>Documento</TableCell>
												<TableCell>Fecha del cobro</TableCell>
												<TableCell align="right">Importe</TableCell>
												<TableCell align="right">Intentos</TableCell>
												<TableCell>Plazo y próximo reintento</TableCell>
												<TableCell>
													<Stack direction="row" spacing={0.25} sx={{ alignItems: 'center' }}>
														<span>Estado fiscal</span>
														<InfoTooltip
															label="Impacto de las acciones fiscales"
															title="Las acciones fiscales solo resuelven el comprobante ante ARCA y no modifican el pago confirmado, la cuota ni el saldo de caja."
														/>
													</Stack>
												</TableCell>
												<TableCell align="right">Acciones</TableCell>
											</TableRow>
										</TableHead>
										<TableBody>
											{query.isPending ? (
												<TableRow>
													<TableCell colSpan={8} sx={{ py: 5 }}>
														<Stack
															direction="row"
															spacing={1.5}
															sx={{ justifyContent: 'center', alignItems: 'center' }}
														>
															<CircularProgress size={20} />
															<Typography variant="body2" color="text.secondary">
																Cargando incidencias…
															</Typography>
														</Stack>
													</TableCell>
												</TableRow>
											) : !query.data?.items.length ? (
												<TableRow>
													<TableCell colSpan={8} sx={{ borderBottom: 0 }}>
														<EmptyState
															tone={hasAnyFilter ? 'default' : 'success'}
															icon={!hasAnyFilter ? <CheckCircleOutlinedIcon /> : undefined}
															title={
																hasAnyFilter
																	? 'No encontramos incidencias con estos filtros'
																	: 'Todo al día'
															}
															description={
																hasAnyFilter
																	? 'Probá ampliando el rango de fechas o limpiando el filtro de estado.'
																	: 'No hay facturas ni notas de crédito con autorización o anulación pendientes ante ARCA.'
															}
															action={
																hasAnyFilter ? (
																	<Button variant="outlined" size="small" onClick={clearFilters}>
																		Limpiar filtros
																	</Button>
																) : null
															}
														/>
													</TableCell>
												</TableRow>
											) : (
												query.data.items.map((row) => {
													const chip = chipEstadoFiscal(row.estadoFiscal);
													return (
														<TableRow key={row.comprobanteId}>
															<TableCell>
																<Typography variant="body2" sx={{ fontWeight: 600 }}>
																	{row.socio.apellido}, {row.socio.nombre}
																</Typography>
																<Typography
																	variant="caption"
																	color="text.secondary"
																	sx={{ fontVariantNumeric: 'tabular-nums' }}
																>
																	Socio #{row.socio.nroSocio} · DNI {row.socio.dni}
																</Typography>
															</TableCell>
															<TableCell>
																<Typography variant="body2" sx={{ fontWeight: 500 }}>
																	{row.tipo === 'nota_credito' ? 'Nota de Crédito C' : 'Factura C'}
																</Typography>
																{row.numero && (
																	<Typography
																		variant="caption"
																		color="text.secondary"
																		sx={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}
																	>
																		N.º {row.numero}
																	</Typography>
																)}
																{row.origenId && (
																	<Typography
																		variant="caption"
																		color="text.secondary"
																		sx={{ display: 'block' }}
																	>
																		Vinculada a factura original
																	</Typography>
																)}
																{row.ncId && (
																	<Typography
																		variant="caption"
																		color="text.secondary"
																		sx={{ display: 'block' }}
																	>
																		Con Nota de Crédito asociada
																	</Typography>
																)}
															</TableCell>
															<TableCell
																sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
															>
																{fechaCobranza(row.fechaCobro)}
															</TableCell>
															<TableCell
																align="right"
																sx={{
																	whiteSpace: 'nowrap',
																	fontWeight: 600,
																	fontVariantNumeric: 'tabular-nums',
																}}
															>
																{monedaCobranza(row.monto)}
															</TableCell>
															<TableCell
																align="right"
																sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
															>
																{row.intentos} / 6
															</TableCell>
															<TableCell sx={{ minWidth: 180 }}>
																<Typography
																	variant="caption"
																	color="text.secondary"
																	sx={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}
																>
																	{row.ventanaFin
																		? `Plazo hasta: ${fechaCobranza(row.ventanaFin)}`
																		: 'Sin plazo vigente'}
																</Typography>
																<Typography
																	variant="caption"
																	color="text.secondary"
																	sx={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}
																>
																	{row.proximoReintento
																		? `Próximo reintento: ${fechaCobranza(row.proximoReintento)}`
																		: 'Sin reintento programado'}
																</Typography>
															</TableCell>
															<TableCell>
																<Chip size="small" color={chip.color} label={chip.label} />
																<Typography
																	variant="caption"
																	color="text.secondary"
																	sx={{ display: 'block', mt: 0.5 }}
																>
																	{row.pagoEstado === 'anulado'
																		? 'Cobro anulado'
																		: 'Cobro confirmado'}
																</Typography>
																{row.bloqueo && (
																	<Typography
																		variant="caption"
																		color="error.main"
																		sx={{ display: 'block', mt: 0.25 }}
																	>
																		{row.bloqueo}
																	</Typography>
																)}
															</TableCell>
															<TableCell align="right">{buttons(row)}</TableCell>
														</TableRow>
													);
												})
											)}
										</TableBody>
									</Table>
								</TableContainer>
								<TablePagination
									component="div"
									count={query.data?.total ?? 0}
									page={Math.min(
										criteria.page - 1,
										Math.max(0, Math.ceil((query.data?.total ?? 0) / criteria.pageSize) - 1),
									)}
									rowsPerPage={criteria.pageSize}
									rowsPerPageOptions={[20, 50, 100]}
									onPageChange={(_, page) => setCriteria((c) => ({ ...c, page: page + 1 }))}
									onRowsPerPageChange={(e) =>
										change('pageSize', Number(e.target.value) as 20 | 50 | 100)
									}
									labelRowsPerPage="Filas por página"
									labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
								/>
							</>
						))}
				</Stack>
			</Paper>

			{detail && (
				<Dialog
					open
					fullWidth
					maxWidth="sm"
					aria-labelledby="monitoreo-detalle-title"
					onClose={() => setDetail(null)}
				>
					<DialogTitle id="monitoreo-detalle-title">
						<Stack
							direction="row"
							spacing={1}
							useFlexGap
							sx={{ alignItems: 'center', flexWrap: 'wrap' }}
						>
							<span>Detalle fiscal</span>
							<Chip
								size="small"
								color={chipEstadoFiscal(detail.estadoFiscal).color}
								label={chipEstadoFiscal(detail.estadoFiscal).label}
							/>
						</Stack>
					</DialogTitle>
					<DialogContent dividers>
						<Stack spacing={2.25}>
							<Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover' }}>
								<Stack
									direction="row"
									spacing={1.5}
									sx={{ alignItems: 'center', justifyContent: 'space-between' }}
								>
									<Box sx={{ minWidth: 0 }}>
										<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
											{detail.socio.apellido}, {detail.socio.nombre}
										</Typography>
										<Typography
											variant="caption"
											color="text.secondary"
											sx={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}
										>
											{detail.tipo === 'nota_credito' ? 'Nota de Crédito C' : 'Factura C'} · Cobro{' '}
											{fechaCobranza(detail.fechaCobro)}
										</Typography>
									</Box>
									<Typography
										variant="h6"
										sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}
									>
										{monedaCobranza(detail.monto)}
									</Typography>
								</Stack>
							</Paper>
							{detail.detalleError && <Alert severity="warning">{detail.detalleError}</Alert>}
							<FiscalComprobantePanel
								key={`${cacheScope}:${detail.comprobanteId}`}
								comprobanteId={detail.comprobanteId}
								ocultarEnlaceMonitoreo
								onUpdated={refresh}
							/>
						</Stack>
					</DialogContent>
					<DialogActions sx={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
						<Button
							size="small"
							component={Link}
							to={`/pagos?pagoId=${detail.pagoId}`}
							endIcon={<OpenInNewOutlinedIcon fontSize="small" />}
							onClick={() => setDetail(null)}
						>
							Ver cobro completo
						</Button>
						<Button onClick={() => setDetail(null)}>Cerrar</Button>
					</DialogActions>
				</Dialog>
			)}

			{action && (
				<AccionFiscalDialog
					key={`${cacheScope}:${action.fila.comprobanteId}:${action.accion}`}
					fila={action.fila}
					accion={action.accion}
					onClose={() => setAction(null)}
					onUpdated={refresh}
				/>
			)}
		</Stack>
	);
}
