import AddCardOutlinedIcon from '@mui/icons-material/AddCardOutlined';
import {
	Alert,
	Box,
	Button,
	Chip,
	MenuItem,
	Paper,
	Stack,
	Tab,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TablePagination,
	TableRow,
	TableSortLabel,
	Tabs,
	TextField,
	Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getCategorias } from '#entities/categoria';
import { getCuotasCobranza } from '#entities/cuota';
import { getDeportes } from '#entities/deporte';
import { getPagosCobranza } from '#entities/pago';
import { useAuth } from '#entities/session';
import { CobrarCuotaDialog, type CobroConfirmado } from '#features/cobrar-cuota';
import {
	type CriteriosCobranza,
	criteriosCobranzaIniciales,
	estadoFiscalCobranza,
	esUuidCobranza,
	fechaCobranza,
	monedaCobranza,
	periodoCobranza,
} from '#shared/types/cobranza';
import { PagoDetalleDialog } from './PagoDetalleDialog';

export function PagosPage() {
	const { cacheScope, perfil, profileStatus } = useAuth();
	return (
		<PagosPanel
			key={cacheScope}
			scope={cacheScope}
			actorId={perfil?.id ?? ''}
			enabled={profileStatus === 'ready'}
		/>
	);
}
function PagosPanel({
	scope,
	actorId,
	enabled,
}: {
	scope: string;
	actorId: string;
	enabled: boolean;
}) {
	const [params, setParams] = useSearchParams();
	const socioId = params.get('socioId') ?? '';
	const deepPago = params.get('pagoId');
	const [tab, setTab] = useState<'cuotas' | 'pagos'>(deepPago ? 'pagos' : 'cuotas');
	const [criteria, setCriteria] = useState<CriteriosCobranza>(() => ({
		...criteriosCobranzaIniciales(),
		estado_cuota: 'pendiente',
	}));
	const [search, setSearch] = useState('');
	const [receipt, setReceipt] = useState('');
	const [cuotaId, setCuotaId] = useState<string | null>(null);
	const [pagoId, setPagoId] = useState<string | null>(deepPago);
	const [confirmed, setConfirmed] = useState<CobroConfirmado | null>(null);
	const invalidSocio = !!socioId && !esUuidCobranza(socioId);
	const input = {
		...criteria,
		socio_id: esUuidCobranza(socioId) ? socioId : '',
		estado_cuota: tab === 'pagos' ? ('todos' as const) : criteria.estado_cuota,
	};
	const list = useQuery({
		queryKey: [tab, scope, 'cobranza', input],
		queryFn: ({ signal }) =>
			(tab === 'cuotas' ? getCuotasCobranza : getPagosCobranza)(input, actorId, signal),
		enabled: enabled && !invalidSocio,
		retry: 1,
	});
	const sports = useQuery({
		queryKey: ['deportes', scope, 'cobranza'],
		queryFn: ({ signal }) => getDeportes(false, signal),
		enabled,
		retry: 1,
	});
	const categories = useQuery({
		queryKey: ['categorias', scope, 'cobranza', criteria.deporte_id],
		queryFn: ({ signal }) => getCategorias(criteria.deporte_id, false, signal),
		enabled: enabled && !!criteria.deporte_id,
		retry: 1,
	});
	const update = <K extends keyof CriteriosCobranza>(field: K, value: CriteriosCobranza[K]) =>
		setCriteria((current) => ({ ...current, [field]: value, pagina: 0 }));
	useEffect(() => {
		const timeout = setTimeout(
			() =>
				setCriteria((current) => ({ ...current, buscar: search, comprobante: receipt, pagina: 0 })),
			300,
		);
		return () => clearTimeout(timeout);
	}, [search, receipt]);
	useEffect(() => {
		const id = socioId;
		setCriteria((current) => ({ ...current, pagina: 0, socio_id: id }));
	}, [socioId]);
	useEffect(() => {
		if (deepPago) {
			setPagoId(deepPago);
			setTab('pagos');
		}
	}, [deepPago]);
	useEffect(() => {
		if (list.data) {
			const last = Math.max(0, Math.ceil(list.data.total / criteria.limite) - 1);
			if (criteria.pagina > last) {
				setCriteria((current) => ({ ...current, pagina: last }));
			}
		}
	}, [list.data, criteria.pagina, criteria.limite]);
	const closeDetail = () => {
		setPagoId(null);
		if (deepPago) {
			const next = new URLSearchParams(params);
			next.delete('pagoId');
			setParams(next, { replace: true });
		}
	};
	const saved = (result: CobroConfirmado) => {
		setCuotaId(null);
		setConfirmed(result);
		void list.refetch();
	};
	const sort = (field: CriteriosCobranza['orden']) =>
		setCriteria((current) => ({
			...current,
			pagina: 0,
			orden: field,
			direccion: current.orden === field && current.direccion === 'asc' ? 'desc' : 'asc',
		}));
	const header = (label: string, field: CriteriosCobranza['orden']) => (
		<TableSortLabel
			active={criteria.orden === field}
			direction={criteria.orden === field ? criteria.direccion : 'asc'}
			onClick={() => sort(field)}
		>
			{label}
		</TableSortLabel>
	);
	const clear = () => {
		setCriteria({ ...criteriosCobranzaIniciales(), estado_cuota: 'pendiente' });
		setSearch('');
		setReceipt('');
		if (socioId) {
			const next = new URLSearchParams(params);
			next.delete('socioId');
			setParams(next);
		}
	};
	return (
		<Stack spacing={3}>
			<Box>
				<Typography variant="h4" component="h1">
					Pagos y cobranzas
				</Typography>
				<Typography sx={{ mt: 1 }} color="text.secondary">
					Consultá cuotas y cobros, con su estado financiero y fiscal por separado.
				</Typography>
			</Box>
			{confirmed && (
				<Alert
					severity="success"
					onClose={() => setConfirmed(null)}
					action={<Button onClick={() => setPagoId(confirmed.pago.pago_id)}>Ver detalle</Button>}
				>
					{confirmed.origen === 'registrado'
						? 'Cobro registrado.'
						: confirmed.origen === 'recuperado'
							? 'Resultado del cobro recuperado.'
							: 'La cuota ya tiene un cobro confirmado; no se registró otro.'}{' '}
					{estadoFiscalCobranza(confirmed.pago)}.
				</Alert>
			)}
			{invalidSocio && (
				<Alert severity="warning">
					El filtro de socio no es válido. Quitalo para consultar el historial.
				</Alert>
			)}
			<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
				<Stack spacing={2}>
					<Stack
						direction={{ xs: 'column', sm: 'row' }}
						spacing={2}
						sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
					>
						<Typography component="h2" variant="h6">
							{tab === 'cuotas' ? 'Cuotas de socios' : 'Historial de cobranzas'}
						</Typography>
						{tab === 'pagos' && (
							<Button
								variant="contained"
								startIcon={<AddCardOutlinedIcon />}
								onClick={() => {
									setTab('cuotas');
									update('estado_cuota', 'pendiente');
								}}
							>
								Registrar cobro
							</Button>
						)}
					</Stack>
					<Tabs
						value={tab}
						onChange={(_, value: 'cuotas' | 'pagos') => {
							setTab(value);
							setCriteria((current) => ({
								...current,
								pagina: 0,
								periodo_mes: null,
								periodo_anio: null,
								orden: 'fecha',
								direccion: 'desc',
								medio: 'todos',
								estado_recibo: 'todos',
								comprobante: '',
								desde: '',
								hasta: '',
							}));
							setReceipt('');
						}}
						aria-label="Consulta de cuotas y cobros"
					>
						<Tab value="cuotas" label="Cuotas" />
						<Tab value="pagos" label="Historial de cobros" />
					</Tabs>
					{socioId && !invalidSocio && (
						<Alert severity="info">
							Consulta filtrada por socio. El estado inactivo no oculta sus cuotas o cobros
							históricos.
						</Alert>
					)}
					<Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
						<TextField
							size="small"
							label="Nombre, apellido, DNI o n.º de socio"
							value={search}
							slotProps={{ htmlInput: { maxLength: 100 } }}
							onChange={(e) => setSearch(e.target.value)}
							sx={{ flex: 1, minWidth: 230 }}
						/>
						<TextField
							size="small"
							label="Desde"
							type="date"
							value={criteria.desde}
							slotProps={{ inputLabel: { shrink: true } }}
							onChange={(e) => update('desde', e.target.value)}
						/>
						<TextField
							size="small"
							label="Hasta"
							type="date"
							value={criteria.hasta}
							slotProps={{ inputLabel: { shrink: true } }}
							onChange={(e) => update('hasta', e.target.value)}
						/>
					</Stack>
					<Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
						<TextField
							size="small"
							select
							label="Estado del socio"
							value={criteria.estado_socio}
							onChange={(e) =>
								update('estado_socio', e.target.value as CriteriosCobranza['estado_socio'])
							}
							sx={{ minWidth: 170 }}
						>
							<MenuItem value="todos">Todos los socios</MenuItem>
							<MenuItem value="activo">Activo</MenuItem>
							<MenuItem value="inactivo">Inactivo</MenuItem>
						</TextField>
						{tab === 'cuotas' ? (
							<>
								<TextField
									size="small"
									select
									label="Estado de cuota"
									value={criteria.estado_cuota}
									onChange={(e) =>
										update('estado_cuota', e.target.value as CriteriosCobranza['estado_cuota'])
									}
									sx={{ minWidth: 170 }}
								>
									<MenuItem value="todos">Todas</MenuItem>
									<MenuItem value="pendiente">Pendiente</MenuItem>
									<MenuItem value="pagada">Pagada</MenuItem>
								</TextField>
								<TextField
									size="small"
									type="number"
									label="Mes del período"
									value={criteria.periodo_mes ?? ''}
									slotProps={{ htmlInput: { min: 1, max: 12, step: 1 } }}
									onChange={(e) =>
										update('periodo_mes', e.target.value ? Number(e.target.value) : null)
									}
									sx={{ width: 170 }}
								/>
								<TextField
									size="small"
									type="number"
									label="Año del período"
									value={criteria.periodo_anio ?? ''}
									slotProps={{ htmlInput: { min: 2001, max: 9999, step: 1 } }}
									onChange={(e) =>
										update('periodo_anio', e.target.value ? Number(e.target.value) : null)
									}
									sx={{ width: 170 }}
								/>
							</>
						) : (
							<>
								<TextField
									size="small"
									label="Número de comprobante"
									value={receipt}
									slotProps={{ htmlInput: { maxLength: 100 } }}
									onChange={(e) => setReceipt(e.target.value)}
								/>
								<TextField
									size="small"
									select
									label="Medio de pago"
									value={criteria.medio}
									onChange={(e) => update('medio', e.target.value as CriteriosCobranza['medio'])}
									sx={{ minWidth: 150 }}
								>
									<MenuItem value="todos">Todos</MenuItem>
									<MenuItem value="efectivo">Efectivo</MenuItem>
									<MenuItem value="transferencia">Transferencia</MenuItem>
								</TextField>
								<TextField
									size="small"
									select
									label="Estado del recibo"
									value={criteria.estado_recibo}
									onChange={(e) =>
										update('estado_recibo', e.target.value as CriteriosCobranza['estado_recibo'])
									}
									sx={{ minWidth: 180 }}
								>
									<MenuItem value="todos">Todos</MenuItem>
									<MenuItem value="activo">Autorizado</MenuItem>
									<MenuItem value="pendiente_cae">Pendiente de CAE</MenuItem>
									<MenuItem value="fallido">Fiscal fallido</MenuItem>
									<MenuItem value="anulado">Cobro anulado</MenuItem>
								</TextField>
							</>
						)}
						<Button onClick={clear}>Limpiar filtros</Button>
					</Stack>
					<Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
						<TextField
							size="small"
							select
							label="Deporte"
							value={criteria.deporte_id}
							sx={{ minWidth: 200 }}
							disabled={sports.isPending || sports.isError}
							onChange={(e) =>
								setCriteria((current) => ({
									...current,
									deporte_id: e.target.value,
									categoria_id: '',
									pagina: 0,
								}))
							}
						>
							<MenuItem value="">Todos los deportes</MenuItem>
							{sports.data?.map((d) => (
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
							value={criteria.categoria_id}
							sx={{ minWidth: 200 }}
							disabled={!criteria.deporte_id || categories.isPending || categories.isError}
							onChange={(e) => update('categoria_id', e.target.value)}
						>
							<MenuItem value="">Todas las categorías</MenuItem>
							{categories.data?.map((c) => (
								<MenuItem key={c.id} value={c.id}>
									{c.nombre}
									{c.estado === 'inactivo' ? ' (inactiva)' : ''}
								</MenuItem>
							))}
						</TextField>
					</Stack>
					{(sports.isError || categories.isError) && (
						<Alert
							severity="warning"
							action={
								<Button
									onClick={() => {
										void sports.refetch();
										if (criteria.deporte_id) {
											void categories.refetch();
										}
									}}
								>
									Reintentar
								</Button>
							}
						>
							No pudimos cargar los filtros de actividad.
						</Alert>
					)}
					{criteria.desde && criteria.hasta && criteria.desde > criteria.hasta && (
						<Alert severity="warning">La fecha inicial debe ser anterior o igual a la final.</Alert>
					)}
					{tab === 'cuotas' && list.data && (
						<Typography variant="body2" color="text.secondary">
							Deuda pendiente de las cuotas filtradas:{' '}
							<strong>{monedaCobranza(list.data.deuda_filtrada)}</strong>. El total incluye todas
							las páginas de esta consulta.
						</Typography>
					)}
					{list.isError ? (
						<Alert
							severity="error"
							action={<Button onClick={() => void list.refetch()}>Reintentar</Button>}
						>
							No pudimos consultar las cobranzas. Revisá los filtros, permisos y conexión.
						</Alert>
					) : (
						<>
							<TableContainer>
								<Table
									size="small"
									aria-label={tab === 'cuotas' ? 'Cuotas de socios' : 'Historial de cobros'}
								>
									<TableHead>
										<TableRow>
											<TableCell>
												{header(tab === 'cuotas' ? 'Emisión' : 'Fecha / hora', 'fecha')}
											</TableCell>
											<TableCell>{header('Socio', 'socio')}</TableCell>
											<TableCell>{header('Período / actividad', 'periodo')}</TableCell>
											<TableCell align="right">{header('Importe', 'monto')}</TableCell>
											{tab === 'pagos' && (
												<>
													<TableCell>{header('Medio', 'medio')}</TableCell>
													<TableCell>{header('Comprobante', 'numero')}</TableCell>
												</>
											)}
											<TableCell>
												{tab === 'cuotas' ? 'Cuota' : header('Recibo', 'estado')}
											</TableCell>
											<TableCell>Acciones</TableCell>
										</TableRow>
									</TableHead>
									<TableBody>
										{list.isPending ? (
											<TableRow>
												<TableCell colSpan={tab === 'pagos' ? 8 : 6}>Cargando…</TableCell>
											</TableRow>
										) : !list.data?.filas.length ? (
											<TableRow>
												<TableCell colSpan={tab === 'pagos' ? 8 : 6}>
													No se encontraron registros para esta consulta.
												</TableCell>
											</TableRow>
										) : (
											list.data.filas.map((row) => (
												<TableRow key={row.id}>
													<TableCell>{fechaCobranza(row.fecha)}</TableCell>
													<TableCell>
														<Typography variant="body2" sx={{ fontWeight: 600 }}>
															{row.socio_apellido}, {row.socio_nombre}
														</Typography>
														<Typography variant="caption" color="text.secondary">
															DNI {row.socio_dni} · Socio {row.socio_numero}
														</Typography>
														{row.socio_estado === 'inactivo' && (
															<Chip
																size="small"
																label="Socio inactivo"
																variant="outlined"
																sx={{ display: 'flex', mt: 0.5 }}
															/>
														)}
													</TableCell>
													<TableCell>
														{periodoCobranza(row)}
														<Typography
															variant="caption"
															sx={{ display: 'block' }}
															color="text.secondary"
														>
															{row.deporte_nombre} · {row.categoria_nombre}
														</Typography>
													</TableCell>
													<TableCell align="right">{monedaCobranza(row.monto)}</TableCell>
													{tab === 'pagos' && (
														<>
															<TableCell>
																{row.medio === 'transferencia' ? 'Transferencia' : 'Efectivo'}
															</TableCell>
															<TableCell>
																{row.numero_comprobante || 'Sin numeración autorizada'}
															</TableCell>
														</>
													)}
													<TableCell>
														<Chip
															size="small"
															color={
																tab === 'cuotas'
																	? row.estado_cuota === 'pagada'
																		? 'success'
																		: row.cuota_en_mora
																			? 'warning'
																			: 'default'
																	: row.estado_pago === 'anulado'
																		? 'default'
																		: row.estado_fiscal === 'valido'
																			? 'success'
																			: 'warning'
															}
															label={
																tab === 'cuotas'
																	? row.estado_cuota === 'pagada'
																		? 'Pagada'
																		: row.cuota_en_mora
																			? 'Pendiente con mora'
																			: 'Pendiente en plazo'
																	: estadoFiscalCobranza(row)
															}
														/>
													</TableCell>
													<TableCell>
														{tab === 'cuotas' && row.estado_cuota === 'pendiente' ? (
															<Button
																size="small"
																onClick={() => setCuotaId(row.cuota_id)}
																disabled={row.monto <= 0}
															>
																Registrar cobro
															</Button>
														) : row.pago_id ? (
															<Button size="small" onClick={() => setPagoId(row.pago_id)}>
																Ver detalle
															</Button>
														) : null}
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
								page={criteria.pagina}
								rowsPerPage={criteria.limite}
								rowsPerPageOptions={[20, 50, 100]}
								onPageChange={(_, page) => setCriteria((current) => ({ ...current, pagina: page }))}
								onRowsPerPageChange={(e) =>
									update('limite', Number(e.target.value) as 20 | 50 | 100)
								}
								labelRowsPerPage="Filas por página"
								labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
							/>
						</>
					)}
				</Stack>
			</Paper>
			{cuotaId && (
				<CobrarCuotaDialog
					key={`${scope}:${cuotaId}`}
					cuotaId={cuotaId}
					onClose={() => setCuotaId(null)}
					onConfirmed={saved}
				/>
			)}{' '}
			{pagoId && (
				<PagoDetalleDialog key={`${scope}:${pagoId}`} pagoId={pagoId} onClose={closeDetail} />
			)}
		</Stack>
	);
}
