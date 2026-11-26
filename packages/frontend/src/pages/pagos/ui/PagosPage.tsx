import AddCardOutlinedIcon from '@mui/icons-material/AddCardOutlined';
import FilterListOutlinedIcon from '@mui/icons-material/FilterListOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
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
import { Link, useSearchParams } from 'react-router-dom';
import { getCategorias } from '#entities/categoria';
import { getCuotasCobranza } from '#entities/cuota';
import { getDeportes } from '#entities/deporte';
import { getPagosCobranza, getPagosReporte } from '#entities/pago';
import { useAuth } from '#entities/session';
import { CobrarCuotaDialog, type CobroConfirmado } from '#features/cobrar-cuota';
import { type ColumnaExportacion, ExportGridButton } from '#features/export-grid';
import {
	type CriteriosCobranza,
	criteriosCobranzaIniciales,
	estadoFiscalCobranza,
	esUuidCobranza,
	type FilaCobranza,
	fechaCobranza,
	monedaCobranza,
	periodoCobranza,
} from '#shared/types/cobranza';
import { DateRangePresets, EmptyState, InfoTooltip, KpiCard, PageHeader } from '#shared/ui';
import { PagoDetalleDialog } from './PagoDetalleDialog';

const MESES = [
	{ value: 1, label: 'Enero' },
	{ value: 2, label: 'Febrero' },
	{ value: 3, label: 'Marzo' },
	{ value: 4, label: 'Abril' },
	{ value: 5, label: 'Mayo' },
	{ value: 6, label: 'Junio' },
	{ value: 7, label: 'Julio' },
	{ value: 8, label: 'Agosto' },
	{ value: 9, label: 'Septiembre' },
	{ value: 10, label: 'Octubre' },
	{ value: 11, label: 'Noviembre' },
	{ value: 12, label: 'Diciembre' },
] as const;

const PILLS_CUOTA: readonly { value: CriteriosCobranza['estado_cuota']; label: string }[] = [
	{ value: 'pendiente', label: 'Pendientes' },
	{ value: 'pagada', label: 'Pagadas' },
	{ value: 'todos', label: 'Todas' },
];

const PILLS_RECIBO: readonly { value: CriteriosCobranza['estado_recibo']; label: string }[] = [
	{ value: 'todos', label: 'Todos' },
	{ value: 'activo', label: 'Autorizados' },
	{ value: 'pendiente_cae', label: 'Pendiente ARCA' },
	{ value: 'fallido', label: 'Error ARCA' },
	{ value: 'anulado', label: 'Anulados' },
];

function chipEstadoPago(row: FilaCobranza): {
	label: string;
	color: 'success' | 'warning' | 'error' | 'default';
} {
	if (row.estado_pago === 'anulado') {
		return { label: 'Cobro anulado', color: 'default' };
	}
	if (row.estado_fiscal === 'valido') {
		return { label: 'Autorizado', color: 'success' };
	}
	if (row.estado_fiscal === 'fallido') {
		return { label: 'Error ARCA', color: 'error' };
	}
	if (row.estado_fiscal === 'anulacion_pendiente') {
		return { label: 'Anulación pendiente', color: 'warning' };
	}
	if (row.estado_fiscal === 'pendiente_cae') {
		return { label: 'Pendiente ARCA', color: 'warning' };
	}
	if (row.estado_fiscal === 'anulado') {
		return { label: 'Documento anulado', color: 'default' };
	}
	return { label: 'Sin comprobante', color: 'default' };
}

const columnasPagos: readonly ColumnaExportacion<FilaCobranza>[] = [
	{
		titulo: 'Fecha y hora (Buenos Aires)',
		tipo: 'texto',
		valor: (p) => fechaCobranza(p.fecha_pago),
	},
	{ titulo: 'Número de socio', tipo: 'numero', valor: (p) => p.socio_numero },
	{ titulo: 'DNI', tipo: 'texto', valor: (p) => p.socio_dni },
	{ titulo: 'Apellido', tipo: 'texto', valor: (p) => p.socio_apellido },
	{ titulo: 'Nombre', tipo: 'texto', valor: (p) => p.socio_nombre },
	{ titulo: 'Deporte', tipo: 'texto', valor: (p) => p.deporte_nombre },
	{ titulo: 'Categoría', tipo: 'texto', valor: (p) => p.categoria_nombre },
	{ titulo: 'Período de cuota', tipo: 'texto', valor: (p) => periodoCobranza(p) },
	{ titulo: 'Importe', tipo: 'numero', valor: (p) => p.monto },
	{
		titulo: 'Medio',
		tipo: 'texto',
		valor: (p) =>
			p.medio === 'efectivo' ? 'Efectivo' : p.medio === 'transferencia' ? 'Transferencia' : '',
	},
	{ titulo: 'Comprobante', tipo: 'texto', valor: (p) => p.numero_comprobante },
	{
		titulo: 'Estado del cobro',
		tipo: 'texto',
		valor: (p) => (p.estado_pago === 'anulado' ? 'Anulado' : 'Confirmado'),
	},
	{ titulo: 'Estado fiscal', tipo: 'texto', valor: (p) => estadoFiscalCobranza(p) },
];

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
	const [tab, setTab] = useState<'cuotas' | 'pagos'>(
		deepPago || params.get('tab') === 'pagos' ? 'pagos' : 'cuotas',
	);
	const [criteria, setCriteria] = useState<CriteriosCobranza>(() => ({
		...criteriosCobranzaIniciales(),
		estado_cuota: params.get('estadoCuota') === 'pagada' ? 'pagada' : 'pendiente',
		desde: params.get('desde') ?? '',
		hasta: params.get('hasta') ?? '',
	}));
	const [search, setSearch] = useState('');
	const [receipt, setReceipt] = useState('');
	const [filtersOpen, setFiltersOpen] = useState(() =>
		Boolean(params.get('desde') || params.get('hasta')),
	);
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

	const tabUrl = params.get('tab'),
		desdeUrl = params.get('desde') ?? '',
		hastaUrl = params.get('hasta') ?? '',
		estadoUrl = params.get('estadoCuota');

	useEffect(() => {
		if (tabUrl === 'pagos' || tabUrl === 'cuotas') {
			setTab(tabUrl);
			setCriteria((x) => ({
				...x,
				pagina: 0,
				desde: desdeUrl,
				hasta: hastaUrl,
				estado_cuota: estadoUrl === 'pagada' ? 'pagada' : 'pendiente',
			}));
			if (desdeUrl || hastaUrl) {
				setFiltersOpen(true);
			}
		}
	}, [tabUrl, desdeUrl, hastaUrl, estadoUrl]);

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
		setPagoId(result.pago.pago_id);
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

	const clearSocio = () => {
		const next = new URLSearchParams(params);
		next.delete('socioId');
		setParams(next, { replace: true });
	};

	const clear = () => {
		setCriteria({ ...criteriosCobranzaIniciales(), estado_cuota: 'pendiente' });
		setSearch('');
		setReceipt('');
		const next = new URLSearchParams(params);
		for (const key of ['socioId', 'desde', 'hasta', 'estadoCuota']) {
			next.delete(key);
		}
		next.set('tab', tab);
		setParams(next, { replace: true });
	};

	const extraFiltersCount =
		Number(Boolean(criteria.desde || criteria.hasta)) +
		Number(criteria.estado_socio !== 'todos') +
		Number(Boolean(criteria.deporte_id)) +
		Number(Boolean(criteria.categoria_id)) +
		(tab === 'cuotas'
			? Number(criteria.periodo_mes !== null) + Number(criteria.periodo_anio !== null)
			: Number(Boolean(receipt.trim())) + Number(criteria.medio !== 'todos'));

	const hasAnyFilter =
		Boolean(search.trim()) ||
		Boolean(socioId) ||
		extraFiltersCount > 0 ||
		(tab === 'cuotas' ? criteria.estado_cuota !== 'pendiente' : criteria.estado_recibo !== 'todos');

	const selectedSportExists =
		!criteria.deporte_id || (sports.data?.some((d) => d.id === criteria.deporte_id) ?? false);
	const selectedCategoryExists =
		!criteria.categoria_id ||
		(categories.data?.some((c) => c.id === criteria.categoria_id) ?? false);

	const colSpan = tab === 'pagos' ? 8 : 6;
	const deudaNumerica = list.data ? Number(list.data.deuda_filtrada) : 0;

	return (
		<Stack spacing={3}>
			<PageHeader
				title="Cobranza y pagos"
				subtitle="Consultá cuotas pendientes, registrá cobros y seguí el estado fiscal ARCA de cada comprobante."
				actions={
					<>
						<Button
							component={Link}
							to="/monitoreo-fiscal"
							variant="outlined"
							startIcon={<ReceiptLongOutlinedIcon />}
						>
							Monitoreo fiscal
						</Button>
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
					</>
				}
			/>

			{confirmed && (
				<Alert
					severity="success"
					onClose={() => setConfirmed(null)}
					action={
						<Button size="small" color="inherit" onClick={() => setPagoId(confirmed.pago.pago_id)}>
							Ver detalle
						</Button>
					}
				>
					{confirmed.origen === 'registrado'
						? 'Cobro registrado correctamente.'
						: confirmed.origen === 'recuperado'
							? 'Cobro confirmado a partir del intento anterior.'
							: 'Esta cuota ya tenía un cobro confirmado; no se registró uno duplicado.'}{' '}
					Podés descargar el comprobante y consultar su autorización ARCA desde el detalle.
				</Alert>
			)}

			{invalidSocio && (
				<Alert
					severity="warning"
					action={
						<Button size="small" color="inherit" onClick={clearSocio}>
							Quitar filtro
						</Button>
					}
				>
					El filtro de socio en la dirección no es válido. Quitalo para ver el listado completo.
				</Alert>
			)}

			{tab === 'cuotas' && (
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
						gap: 2,
					}}
				>
					<KpiCard
						label="Deuda pendiente (consulta actual)"
						value={list.data ? monedaCobranza(list.data.deuda_filtrada) : '—'}
						caption="Incluye todas las páginas de las cuotas pendientes que coinciden con estos filtros."
						tone={list.data ? (deudaNumerica > 0 ? 'warning' : 'success') : 'neutral'}
					/>
					<KpiCard
						label="Cuotas en esta consulta"
						value={list.data ? String(list.data.total) : '—'}
						caption={
							criteria.estado_cuota === 'pendiente'
								? 'Filtrado por cuotas pendientes de pago.'
								: criteria.estado_cuota === 'pagada'
									? 'Filtrado por cuotas ya pagadas.'
									: 'Mostrando cuotas pendientes y pagadas.'
						}
						tone="primary"
					/>
				</Box>
			)}

			<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
				<Stack spacing={2.25}>
					<Stack
						direction={{ xs: 'column', md: 'row' }}
						spacing={1.5}
						sx={{
							alignItems: { xs: 'stretch', md: 'center' },
							justifyContent: 'space-between',
							borderBottom: 1,
							borderColor: 'divider',
							pb: 1,
						}}
					>
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
							sx={{ minHeight: 42 }}
						>
							<Tab value="cuotas" label="Cuotas" sx={{ minHeight: 42 }} />
							<Tab value="pagos" label="Historial de cobros" sx={{ minHeight: 42 }} />
						</Tabs>

						<Stack
							direction="row"
							spacing={0.75}
							useFlexGap
							sx={{ flexWrap: 'wrap', alignItems: 'center' }}
						>
							{tab === 'cuotas'
								? PILLS_CUOTA.map((pill) => {
										const active = criteria.estado_cuota === pill.value;
										return (
											<Chip
												key={pill.value}
												size="small"
												label={pill.label}
												clickable
												color={active ? 'primary' : 'default'}
												variant={active ? 'filled' : 'outlined'}
												onClick={() => update('estado_cuota', pill.value)}
											/>
										);
									})
								: PILLS_RECIBO.map((pill) => {
										const active = criteria.estado_recibo === pill.value;
										return (
											<Chip
												key={pill.value}
												size="small"
												label={pill.label}
												clickable
												color={active ? 'primary' : 'default'}
												variant={active ? 'filled' : 'outlined'}
												onClick={() => update('estado_recibo', pill.value)}
											/>
										);
									})}
						</Stack>
					</Stack>

					{socioId && !invalidSocio && (
						<Alert
							severity="info"
							action={
								<Button size="small" color="inherit" onClick={clearSocio}>
									Ver todos los socios
								</Button>
							}
						>
							Mostrando únicamente las cuotas y cobros del socio seleccionado. Los socios inactivos
							conservan todo su historial.
						</Alert>
					)}

					<Stack
						direction={{ xs: 'column', sm: 'row' }}
						spacing={1.5}
						sx={{ alignItems: { sm: 'center' } }}
					>
						<TextField
							size="small"
							label="Buscar socio"
							placeholder="Apellido, nombre, DNI o n.º de socio…"
							value={search}
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
							onChange={(e) => setSearch(e.target.value)}
							sx={{ flex: 1, minWidth: 230 }}
						/>
						<Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
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
								<Button size="small" color="inherit" onClick={clear}>
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
										label={tab === 'cuotas' ? 'Fecha de emisión' : 'Fecha de cobro'}
										desde={criteria.desde}
										hasta={criteria.hasta}
										onSelect={({ desde, hasta }) =>
											setCriteria((current) => ({ ...current, desde, hasta, pagina: 0 }))
										}
									/>
									<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
										<TextField
											size="small"
											label={tab === 'cuotas' ? 'Emisión desde' : 'Cobro desde'}
											type="date"
											value={criteria.desde}
											slotProps={{ inputLabel: { shrink: true } }}
											onChange={(e) => update('desde', e.target.value)}
										/>
										<TextField
											size="small"
											label={tab === 'cuotas' ? 'Emisión hasta' : 'Cobro hasta'}
											type="date"
											value={criteria.hasta}
											slotProps={{ inputLabel: { shrink: true } }}
											onChange={(e) => update('hasta', e.target.value)}
										/>
									</Stack>
								</Stack>

								<Box
									sx={{
										display: 'grid',
										gridTemplateColumns: {
											xs: '1fr',
											sm: 'repeat(2, minmax(0, 1fr))',
											lg: 'repeat(5, minmax(0, 1fr))',
										},
										gap: 1.5,
									}}
								>
									<TextField
										size="small"
										select
										label="Estado del socio"
										value={criteria.estado_socio}
										onChange={(e) =>
											update('estado_socio', e.target.value as CriteriosCobranza['estado_socio'])
										}
									>
										<MenuItem value="todos">Todos los socios</MenuItem>
										<MenuItem value="activo">Activos</MenuItem>
										<MenuItem value="inactivo">Inactivos</MenuItem>
									</TextField>

									<TextField
										size="small"
										select
										label="Deporte"
										value={criteria.deporte_id}
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
										{!selectedSportExists && (
											<MenuItem value={criteria.deporte_id}>Deporte seleccionado</MenuItem>
										)}
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
										disabled={!criteria.deporte_id || categories.isPending || categories.isError}
										onChange={(e) => update('categoria_id', e.target.value)}
									>
										<MenuItem value="">Todas las categorías</MenuItem>
										{!selectedCategoryExists && (
											<MenuItem value={criteria.categoria_id}>Categoría seleccionada</MenuItem>
										)}
										{categories.data?.map((c) => (
											<MenuItem key={c.id} value={c.id}>
												{c.nombre}
												{c.estado === 'inactivo' ? ' (inactiva)' : ''}
											</MenuItem>
										))}
									</TextField>

									{tab === 'cuotas' ? (
										<>
											<TextField
												size="small"
												select
												label="Mes del período"
												value={criteria.periodo_mes === null ? '' : String(criteria.periodo_mes)}
												onChange={(e) =>
													update('periodo_mes', e.target.value ? Number(e.target.value) : null)
												}
											>
												<MenuItem value="">Todos los meses</MenuItem>
												{MESES.map((m) => (
													<MenuItem key={m.value} value={String(m.value)}>
														{m.label}
													</MenuItem>
												))}
											</TextField>
											<TextField
												size="small"
												type="number"
												label="Año del período"
												placeholder="Ej. 2026"
												value={criteria.periodo_anio ?? ''}
												slotProps={{ htmlInput: { min: 2001, max: 9999, step: 1 } }}
												onChange={(e) =>
													update('periodo_anio', e.target.value ? Number(e.target.value) : null)
												}
											/>
										</>
									) : (
										<>
											<TextField
												size="small"
												label="N.º de comprobante"
												placeholder="Ej. 0001-00000042"
												value={receipt}
												slotProps={{ htmlInput: { maxLength: 100 } }}
												onChange={(e) => setReceipt(e.target.value)}
											/>
											<TextField
												size="small"
												select
												label="Medio de pago"
												value={criteria.medio}
												onChange={(e) =>
													update('medio', e.target.value as CriteriosCobranza['medio'])
												}
											>
												<MenuItem value="todos">Todos los medios</MenuItem>
												<MenuItem value="efectivo">Efectivo</MenuItem>
												<MenuItem value="transferencia">Transferencia</MenuItem>
											</TextField>
										</>
									)}
								</Box>
							</Stack>
						</Box>
					</Collapse>

					{(sports.isError || categories.isError) && (
						<Alert
							severity="warning"
							action={
								<Button
									size="small"
									color="inherit"
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
							No pudimos cargar los filtros de deporte y categoría.
						</Alert>
					)}

					{criteria.desde && criteria.hasta && criteria.desde > criteria.hasta && (
						<Alert severity="warning">La fecha inicial debe ser anterior o igual a la final.</Alert>
					)}

					{tab === 'pagos' && (
						<Stack
							direction={{ xs: 'column', sm: 'row' }}
							spacing={1.5}
							sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
						>
							<Typography variant="body2" color="text.secondary">
								{list.data
									? `${list.data.total} ${list.data.total === 1 ? 'cobro encontrado' : 'cobros encontrados'} con los filtros actuales.`
									: 'Consultando historial de cobros…'}
							</Typography>
							<ExportGridButton<FilaCobranza, CriteriosCobranza>
								nombreArchivo="pagos"
								filtroSnapshot={input}
								orden={{ campo: criteria.orden, direccion: criteria.direccion }}
								columnas={columnasPagos}
								claveFila={(p) => p.id}
								disabled={
									!enabled ||
									invalidSocio ||
									list.isFetching ||
									list.isError ||
									search !== criteria.buscar ||
									receipt !== criteria.comprobante
								}
								obtenerPagina={async ({ filtro, pagina, tamanoPagina, version, signal }) => {
									const p = await getPagosReporte(
										{ ...filtro, pagina: pagina - 1, limite: tamanoPagina },
										actorId,
										signal,
										{ revision: version, exportar: true },
									);
									return { filas: p.filas, total: p.total, version: p.revision };
								}}
							/>
						</Stack>
					)}

					{list.isError ? (
						<Alert
							severity="error"
							action={
								<Button size="small" color="inherit" onClick={() => void list.refetch()}>
									Reintentar
								</Button>
							}
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
												{header(tab === 'cuotas' ? 'Emisión' : 'Fecha y hora', 'fecha')}
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
												<Stack direction="row" spacing={0.25} sx={{ alignItems: 'center' }}>
													<span>
														{tab === 'cuotas' ? 'Estado' : header('Estado fiscal', 'estado')}
													</span>
													<InfoTooltip
														label={
															tab === 'cuotas'
																? 'Significado del estado de la cuota'
																: 'Significado del estado fiscal'
														}
														title={
															tab === 'cuotas'
																? 'En plazo: cuota vigente. Con mora: cuota vencida impaga. Pagada: cobro confirmado.'
																: 'Autorizado: comprobante con CAE en ARCA. Pendiente ARCA: aguarda autorización. Error ARCA: requiere revisión en Monitoreo fiscal. Cobro anulado: revertido en caja.'
														}
													/>
												</Stack>
											</TableCell>
											<TableCell align="right">Acciones</TableCell>
										</TableRow>
									</TableHead>
									<TableBody>
										{list.isPending ? (
											<TableRow>
												<TableCell colSpan={colSpan} sx={{ py: 5 }}>
													<Stack
														direction="row"
														spacing={1.5}
														sx={{ justifyContent: 'center', alignItems: 'center' }}
													>
														<CircularProgress size={20} />
														<Typography variant="body2" color="text.secondary">
															Cargando registros…
														</Typography>
													</Stack>
												</TableCell>
											</TableRow>
										) : !list.data?.filas.length ? (
											<TableRow>
												<TableCell colSpan={colSpan} sx={{ borderBottom: 0 }}>
													<EmptyState
														title={
															hasAnyFilter
																? 'No encontramos resultados con estos filtros'
																: tab === 'cuotas'
																	? 'No hay cuotas pendientes'
																	: 'Todavía no hay cobros registrados'
														}
														description={
															hasAnyFilter
																? 'Probá ajustando el rango de fechas, el estado o el texto de búsqueda.'
																: tab === 'cuotas'
																	? 'Cuando se generen cuotas o se inscriba un socio a una actividad, aparecerán acá.'
																	: 'Los cobros que confirmes desde la pestaña Cuotas quedarán registrados en este historial.'
														}
														action={
															hasAnyFilter ? (
																<Button variant="outlined" size="small" onClick={clear}>
																	Limpiar filtros
																</Button>
															) : null
														}
													/>
												</TableCell>
											</TableRow>
										) : (
											list.data.filas.map((row) => {
												const chipPago = tab === 'pagos' ? chipEstadoPago(row) : null;
												return (
													<TableRow key={row.id}>
														<TableCell
															sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
														>
															{fechaCobranza(row.fecha)}
														</TableCell>
														<TableCell>
															<Typography variant="body2" sx={{ fontWeight: 600 }}>
																{row.socio_apellido}, {row.socio_nombre}
															</Typography>
															<Typography
																variant="caption"
																color="text.secondary"
																sx={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}
															>
																DNI {row.socio_dni} · Socio #{row.socio_numero}
															</Typography>
															{row.socio_estado === 'inactivo' && (
																<Box sx={{ mt: 0.5 }}>
																	<Chip size="small" label="Socio inactivo" variant="outlined" />
																</Box>
															)}
														</TableCell>
														<TableCell>
															<Typography
																variant="body2"
																sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
															>
																{periodoCobranza(row)}
															</Typography>
															<Typography
																variant="caption"
																sx={{ display: 'block' }}
																color="text.secondary"
															>
																{row.deporte_nombre} · {row.categoria_nombre}
															</Typography>
														</TableCell>
														<TableCell
															align="right"
															sx={{
																fontWeight: 600,
																whiteSpace: 'nowrap',
																fontVariantNumeric: 'tabular-nums',
															}}
														>
															{monedaCobranza(row.monto)}
														</TableCell>
														{tab === 'pagos' && (
															<>
																<TableCell sx={{ whiteSpace: 'nowrap' }}>
																	{row.medio === 'transferencia' ? 'Transferencia' : 'Efectivo'}
																</TableCell>
																<TableCell
																	sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
																>
																	{row.numero_comprobante ? (
																		row.numero_comprobante
																	) : (
																		<Typography variant="caption" color="text.secondary">
																			Pendiente de numeración
																		</Typography>
																	)}
																</TableCell>
															</>
														)}
														<TableCell sx={{ whiteSpace: 'nowrap' }}>
															{tab === 'cuotas' ? (
																<Chip
																	size="small"
																	color={
																		row.estado_cuota === 'pagada'
																			? 'success'
																			: row.cuota_en_mora
																				? 'error'
																				: 'warning'
																	}
																	label={
																		row.estado_cuota === 'pagada'
																			? 'Pagada'
																			: row.cuota_en_mora
																				? 'Pendiente con mora'
																				: 'Pendiente en plazo'
																	}
																/>
															) : (
																chipPago && (
																	<Chip
																		size="small"
																		color={chipPago.color}
																		label={chipPago.label}
																	/>
																)
															)}
														</TableCell>
														<TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
															{tab === 'cuotas' && row.estado_cuota === 'pendiente' ? (
																<Button
																	size="small"
																	variant="contained"
																	onClick={() => setCuotaId(row.cuota_id)}
																	disabled={row.monto <= 0}
																>
																	Cobrar
																</Button>
															) : row.pago_id ? (
																<Button
																	size="small"
																	variant="outlined"
																	onClick={() => setPagoId(row.pago_id)}
																>
																	Ver detalle
																</Button>
															) : null}
														</TableCell>
													</TableRow>
												);
											})
										)}
									</TableBody>
								</Table>
							</TableContainer>
							<TablePagination
								component="div"
								count={list.data?.total ?? 0}
								page={Math.min(
									criteria.pagina,
									Math.max(0, Math.ceil((list.data?.total ?? 0) / criteria.limite) - 1),
								)}
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
			)}
			{pagoId && (
				<PagoDetalleDialog
					key={`${scope}:${pagoId}`}
					pagoId={pagoId}
					autoEmitir={confirmed?.origen === 'registrado' && confirmed.pago.pago_id === pagoId}
					onClose={closeDetail}
					onUpdated={() => void list.refetch()}
				/>
			)}
		</Stack>
	);
}
