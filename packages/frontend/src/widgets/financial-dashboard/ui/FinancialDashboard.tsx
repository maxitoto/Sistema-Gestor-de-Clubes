import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import {
	Alert,
	Box,
	Button,
	ButtonBase,
	LinearProgress,
	MenuItem,
	Paper,
	Stack,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	TextField,
	Typography,
} from '@mui/material';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
	type Dashboard,
	enlacesDashboard,
	type MesDashboard,
	type PeriodoDashboard,
	periodoDashboardValido,
	useDashboard,
} from '#entities/dashboard';
import { useAuth } from '#entities/session';

const currency = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const integer = new Intl.NumberFormat('es-AR');
const shortDate = new Intl.DateTimeFormat('es-AR', {
	timeZone: 'America/Argentina/Buenos_Aires',
	dateStyle: 'short',
	timeStyle: 'short',
});
const monthNames = [
	'Enero',
	'Febrero',
	'Marzo',
	'Abril',
	'Mayo',
	'Junio',
	'Julio',
	'Agosto',
	'Septiembre',
	'Octubre',
	'Noviembre',
	'Diciembre',
];
const colors = ['#2563eb', '#64748b', '#0891b2', '#7c3aed', '#c2410c', '#0f766e'];
const money = (v: string) => currency.format(Number(v));
const periodLabel = (p: PeriodoDashboard) => `${monthNames[p.mes - 1]} ${p.anio}`;

export function FinancialDashboard({
	periodo,
	onPeriodoChange,
}: {
	periodo: PeriodoDashboard;
	onPeriodoChange: (p: PeriodoDashboard) => void;
}) {
	const { cacheScope, profileStatus, perfil, user, isSigningOut } = useAuth();
	const enabled =
		profileStatus === 'ready' && perfil?.rol === 'admin' && !isSigningOut && Boolean(user);
	const query = useDashboard(periodo, { cacheScope, actorId: user?.id ?? '', enabled });
	const [year, setYear] = useState(String(periodo.anio));
	const validYear =
		periodoDashboardValido({ mes: periodo.mes, anio: Number(year) }) && /^\d{4}$/.test(year);
	if (!enabled) {
		return null;
	}
	return (
		<Stack spacing={3}>
			<Stack
				direction={{ xs: 'column', md: 'row' }}
				spacing={2}
				sx={{ justifyContent: 'space-between' }}
			>
				<Box>
					<Typography component="h1" variant="h4">
						Panel de control financiero
					</Typography>
					<Typography color="text.secondary" sx={{ mt: 1 }}>
						Situación actual del club y movimientos del período elegido.
					</Typography>
				</Box>
				<Stack
					direction="row"
					spacing={1}
					useFlexGap
					sx={{ alignItems: 'flex-start', flexWrap: 'wrap' }}
				>
					<TextField
						size="small"
						select
						label="Mes"
						value={periodo.mes}
						onChange={(e) => onPeriodoChange({ ...periodo, mes: Number(e.target.value) })}
						sx={{ minWidth: 140 }}
					>
						{monthNames.map((name, index) => (
							<MenuItem key={name} value={index + 1}>
								{name}
							</MenuItem>
						))}
					</TextField>
					<TextField
						size="small"
						label="Año"
						value={year}
						onChange={(e) => setYear(e.target.value)}
						onBlur={() => {
							if (validYear) {
								onPeriodoChange({ ...periodo, anio: Number(year) });
							}
						}}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && validYear) {
								onPeriodoChange({ ...periodo, anio: Number(year) });
							}
						}}
						error={!validYear}
						helperText={!validYear ? 'Entre 2001 y 9999' : undefined}
						slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 4 } }}
						sx={{ width: 105 }}
					/>
					<Button
						variant="outlined"
						startIcon={<RefreshOutlinedIcon />}
						onClick={() => void query.refetch()}
						disabled={query.isFetching}
					>
						Actualizar
					</Button>
				</Stack>
			</Stack>
			{query.isFetching && (
				<Box role="status">
					<LinearProgress aria-label="Consultando indicadores del dashboard" />
					<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
						{query.data ? 'Actualizando indicadores…' : 'Consultando indicadores…'}
					</Typography>
				</Box>
			)}
			{query.isError && (
				<Alert
					severity="error"
					action={<Button onClick={() => void query.refetch()}>Reintentar</Button>}
				>
					{query.error instanceof Error
						? query.error.message
						: 'No pudimos consultar el dashboard.'}{' '}
					Los importes no se reemplazaron por ceros.
				</Alert>
			)}
			{!query.isError && query.data && <DashboardData data={query.data} />}
		</Stack>
	);
}

function Kpi({
	title,
	value,
	description,
	to,
	color,
}: {
	title: string;
	value: string;
	description: string;
	to: string;
	color?: string | undefined;
}) {
	return (
		<ButtonBase
			component={Link}
			to={to}
			sx={{
				display: 'block',
				width: '100%',
				textAlign: 'left',
				borderRadius: 1,
				border: 1,
				borderColor: 'divider',
				bgcolor: 'background.paper',
				p: 2.5,
				'&:hover': { bgcolor: 'action.hover' },
				'&.Mui-focusVisible': { outline: '3px solid', outlineColor: 'primary.main' },
			}}
		>
			<Typography component="h2" variant="overline" sx={{ display: 'block', lineHeight: 1.6 }}>
				{title}
			</Typography>
			<Typography
				component="p"
				variant="h4"
				sx={{ my: 1, fontWeight: 700, overflowWrap: 'anywhere', ...(color ? { color } : {}) }}
			>
				{value}
			</Typography>
			<Typography variant="body2" color="text.secondary">
				{description}
			</Typography>
		</ButtonBase>
	);
}

function DashboardData({ data }: { data: Dashboard }) {
	const links = enlacesDashboard(data.periodo),
		p = periodLabel(data.periodo),
		net = Number(data.finanzas.neto);
	return (
		<>
			<Typography variant="body2" color="text.secondary">
				Consultado el {shortDate.format(new Date(data.consultadoEn))} · Hora del club (Buenos
				Aires).
			</Typography>
			<Box
				sx={{
					display: 'grid',
					gridTemplateColumns: {
						xs: '1fr',
						sm: 'repeat(2,minmax(0,1fr))',
						xl: 'repeat(4,minmax(0,1fr))',
					},
					gap: 2,
				}}
			>
				<Kpi
					title="Socios activos"
					value={integer.format(data.actuales.sociosActivos)}
					description="Actualmente, con o sin inscripción vigente."
					to={links.activos}
				/>
				<Kpi
					title="Socios morosos"
					value={integer.format(data.actuales.sociosMorosos)}
					description="Actualmente, con cuotas pendientes de más de 30 días."
					to={links.morosos}
					color={data.actuales.sociosMorosos > 0 ? 'error.main' : undefined}
				/>
				<Kpi
					title="Deuda total pendiente"
					value={money(data.actuales.deudaTotal)}
					description="Actual. Incluye deuda en plazo y en mora, de socios activos e inactivos."
					to={links.deuda}
				/>
				<Kpi
					title="Neto del período"
					value={money(data.finanzas.neto)}
					description={`${p}. Incluye anulaciones; no es el saldo total del club.`}
					to={links.movimientos}
					color={net > 0 ? 'success.main' : net < 0 ? 'error.main' : undefined}
				/>
			</Box>
			<Box
				sx={{
					display: 'grid',
					gridTemplateColumns: { xs: 'minmax(0,1fr)', lg: 'minmax(0,1.5fr) minmax(0,1fr)' },
					gap: 2,
				}}
			>
				<MonthlyChart months={data.meses} />
				<DebtDistribution rows={data.morosidadPorDeporte} />
			</Box>
			<OperationalAlerts data={data} />
			<Paper variant="outlined" sx={{ p: 2.5 }}>
				<Stack
					direction={{ xs: 'column', md: 'row' }}
					spacing={2}
					sx={{ justifyContent: 'space-between', alignItems: { md: 'center' } }}
				>
					<Box>
						<Typography component="h2" variant="h6">
							Finanzas de {p}
						</Typography>
						<Typography variant="body2" color="text.secondary">
							{integer.format(data.finanzas.movimientos)} movimientos, incluidos los reversos por su
							fecha.
						</Typography>
					</Box>
					<Button component={Link} to={links.pagos} variant="outlined">
						Ver cobros del período
					</Button>
				</Stack>
				<Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ mt: 2 }}>
					<Typography>
						Ingresos originales: <strong>{money(data.finanzas.ingresosOriginales)}</strong>
					</Typography>
					<Typography>
						Egresos originales: <strong>{money(data.finanzas.egresosOriginales)}</strong>
					</Typography>
				</Stack>
				<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
					Las anulaciones ajustan el neto y no se muestran como un nuevo ingreso o gasto original.
				</Typography>
			</Paper>
		</>
	);
}

function MonthlyChart({ months }: { months: MesDashboard[] }) {
	const max = Math.max(
		0,
		...months.flatMap((m) => [Number(m.ingresosOriginales), Number(m.egresosOriginales)]),
	);
	return (
		<Paper variant="outlined" sx={{ p: 2.5, minWidth: 0 }}>
			<Typography component="h2" variant="h6">
				Flujo de los últimos seis meses
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				Hasta {months[5] ? periodLabel(months[5]) : ''}. Ingresos y egresos originales.
			</Typography>
			<Stack direction="row" spacing={2} sx={{ mb: 1 }}>
				<Typography variant="body2">
					<Box
						component="span"
						sx={{ display: 'inline-block', width: 10, height: 10, bgcolor: colors[0], mr: 1 }}
					/>
					Ingresos
				</Typography>
				<Typography variant="body2">
					<Box
						component="span"
						sx={{ display: 'inline-block', width: 10, height: 10, bgcolor: colors[1], mr: 1 }}
					/>
					Egresos
				</Typography>
			</Stack>
			{max === 0 ? (
				<Alert severity="info">No hay ingresos ni egresos originales en estos seis meses.</Alert>
			) : (
				<Box
					component="svg"
					role="img"
					aria-label="Comparación mensual de ingresos y egresos originales; importes en la tabla siguiente"
					viewBox="0 0 720 255"
					sx={{ width: '100%', height: 'auto', display: 'block', color: 'text.secondary' }}
				>
					<title>Ingresos y egresos originales de seis meses</title>
					<line x1="12" y1="210" x2="710" y2="210" stroke="currentColor" opacity="0.3" />
					{months.map((m, i) => (
						<g key={`${m.anio}-${m.mes}`}>
							<rect
								x={27 + i * 116}
								y={210 - (Number(m.ingresosOriginales) / max) * 190}
								width="34"
								height={(Number(m.ingresosOriginales) / max) * 190}
								fill={colors[0]}
							>
								<title>
									{periodLabel(m)}: ingresos {money(m.ingresosOriginales)}
								</title>
							</rect>
							<rect
								x={65 + i * 116}
								y={210 - (Number(m.egresosOriginales) / max) * 190}
								width="34"
								height={(Number(m.egresosOriginales) / max) * 190}
								fill={colors[1]}
							>
								<title>
									{periodLabel(m)}: egresos {money(m.egresosOriginales)}
								</title>
							</rect>
							<text x={63 + i * 116} y="239" textAnchor="middle" fill="currentColor" fontSize="15">
								{monthNames[m.mes - 1]?.slice(0, 3)} {String(m.anio).slice(-2)}
							</text>
						</g>
					))}
				</Box>
			)}
			<TableContainer sx={{ mt: 2 }}>
				<Table size="small" aria-label="Importes mensuales del flujo de caja">
					<TableHead>
						<TableRow>
							<TableCell>Mes</TableCell>
							<TableCell align="right">Ingresos</TableCell>
							<TableCell align="right">Egresos</TableCell>
							<TableCell align="right">Neto con anulaciones</TableCell>
						</TableRow>
					</TableHead>
					<TableBody>
						{months.map((m) => (
							<TableRow key={`${m.anio}-${m.mes}`}>
								<TableCell sx={{ whiteSpace: 'nowrap' }}>{periodLabel(m)}</TableCell>
								<TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
									{money(m.ingresosOriginales)}
								</TableCell>
								<TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
									{money(m.egresosOriginales)}
								</TableCell>
								<TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
									{money(m.neto)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</TableContainer>
			<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
				El neto incluye los reversos de cada mes; puede diferir de restar las dos barras.
			</Typography>
		</Paper>
	);
}

function DebtDistribution({ rows }: { rows: Dashboard['morosidadPorDeporte'] }) {
	const total = rows.reduce((n, row) => n + Number(row.deudaMorosa), 0);
	let angle = 0;
	const stops = rows.map((row, i) => {
		const start = angle;
		angle += total > 0 ? (Number(row.deudaMorosa) / total) * 100 : 0;
		return `${colors[i % colors.length]} ${start}% ${angle}%`;
	});
	return (
		<Paper variant="outlined" sx={{ p: 2.5, minWidth: 0 }}>
			<Typography component="h2" variant="h6">
				Morosidad por deporte
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				Importes de cuotas pendientes de más de 30 días. Situación actual.
			</Typography>
			{total === 0 ? (
				<Alert severity="info">No hay deuda en mora para distribuir.</Alert>
			) : (
				<>
					<Box
						role="img"
						aria-label="Distribución de la deuda en mora por deporte; importes en la tabla siguiente"
						sx={{
							mx: 'auto',
							my: 2,
							width: 180,
							height: 180,
							borderRadius: '50%',
							background: `conic-gradient(${stops.join(',')})`,
							border: 1,
							borderColor: 'divider',
						}}
					/>
					<TableContainer>
						<Table size="small" aria-label="Deuda morosa por deporte">
							<TableHead>
								<TableRow>
									<TableCell>Deporte</TableCell>
									<TableCell align="right">Cuotas</TableCell>
									<TableCell align="right">En mora</TableCell>
								</TableRow>
							</TableHead>
							<TableBody>
								{rows.map((row, i) => (
									<TableRow key={row.deporteId}>
										<TableCell>
											<Box
												component="span"
												sx={{
													display: 'inline-block',
													width: 10,
													height: 10,
													bgcolor: colors[i % colors.length],
													mr: 1,
												}}
											/>
											{row.deporte}
										</TableCell>
										<TableCell align="right">{integer.format(row.cuotasMorosas)}</TableCell>
										<TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
											{money(row.deudaMorosa)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</TableContainer>
				</>
			)}
		</Paper>
	);
}

function OperationalAlerts({ data }: { data: Dashboard }) {
	const links = enlacesDashboard(data.periodo),
		a = data.alertas,
		job = a.ultimoJob,
		c = a.certificado;
	const certText =
		c.estado === 'ausente'
			? 'No hay un certificado fiscal completo configurado.'
			: c.estado === 'vencido'
				? `El certificado fiscal venció el ${c.vencimiento?.split('-').reverse().join('/')}.`
				: c.estado === 'proximo'
					? `El certificado fiscal vence ${c.diasRestantes === 0 ? 'hoy' : `en ${c.diasRestantes} días`} (${c.vencimiento?.split('-').reverse().join('/')}).`
					: `Certificado fiscal vigente hasta el ${c.vencimiento?.split('-').reverse().join('/')}.`;
	return (
		<Paper variant="outlined" sx={{ p: 2.5 }}>
			<Typography component="h2" variant="h6" sx={{ mb: 2 }}>
				Alertas y tareas del club
			</Typography>
			<Stack spacing={1.5}>
				<Alert
					severity={a.emailsInvalidos > 0 ? 'warning' : 'success'}
					action={
						<Button component={Link} to={links.emailsInvalidos}>
							Ver socios
						</Button>
					}
				>
					{integer.format(a.emailsInvalidos)} socios con correo marcado como inválido.
				</Alert>
				<Alert
					severity={
						a.comprobantesPendientes + a.comprobantesFallidos + a.anulacionesPendientes > 0
							? 'warning'
							: 'success'
					}
					action={
						<Button component={Link} to={links.fiscal}>
							Ver monitoreo
						</Button>
					}
				>
					{integer.format(a.comprobantesPendientes)} comprobantes pendientes de CAE ·{' '}
					{integer.format(a.comprobantesFallidos)} fallidos ·{' '}
					{integer.format(a.anulacionesPendientes)} anulaciones fiscales pendientes.
				</Alert>
				<Alert
					severity={
						!job
							? 'info'
							: job.estado === 'exitoso'
								? 'success'
								: job.estado === 'fallido'
									? 'error'
									: 'warning'
					}
					action={<Button href={links.cuotas}>Ver historial</Button>}
				>
					{!job ? (
						'Todavía no hay generaciones mensuales registradas.'
					) : (
						<>
							<strong>
								Última generación:{' '}
								{job.estado === 'exitoso'
									? 'completada'
									: job.estado === 'fallido'
										? 'fallida'
										: 'en proceso'}
								.
							</strong>{' '}
							{String(job.periodoMes).padStart(2, '0')}/{job.periodoAnio} ·{' '}
							{integer.format(job.cuotasGeneradas)} cuotas generadas y{' '}
							{integer.format(job.cuotasOmitidas)} ya existentes. Inicio:{' '}
							{shortDate.format(new Date(job.fechaInicio))}.
						</>
					)}
				</Alert>
				<Alert severity="info" action={<Button href={links.cuotas}>Revisar generación</Button>}>
					La generación manual usa el mes actual del club, aunque arriba consultes otro período. Las
					cuotas ya emitidas se conservan.
				</Alert>
				<Alert
					severity={
						c.estado === 'ausente'
							? 'info'
							: c.estado === 'vencido'
								? 'error'
								: c.estado === 'proximo'
									? 'warning'
									: 'success'
					}
					action={
						<Button component={Link} to={links.configuracion}>
							Ver configuración
						</Button>
					}
				>
					{certText}
				</Alert>
			</Stack>
		</Paper>
	);
}
