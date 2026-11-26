import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import {
	Alert,
	Box,
	Button,
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
	useTheme,
} from '@mui/material';
import { useEffect, useState } from 'react';
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
import { formatIsoDateArg } from '#shared/lib/datePresets';
import { EmptyState, InfoTooltip, KpiCard, type KpiTone, PageHeader } from '#shared/ui';

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
const LIGHT_COLORS = ['#2563EB', '#64748B', '#0891B2', '#7C3AED', '#EA580C', '#0D9488'];
const DARK_COLORS = ['#60A5FA', '#94A3B8', '#22D3EE', '#A78BFA', '#FB923C', '#2DD4BF'];
const money = (v: string) => currency.format(Number(v));
const periodLabel = (p: PeriodoDashboard) => `${monthNames[p.mes - 1]} ${p.anio}`;

export function FinancialDashboard({
	periodo,
	onPeriodoChange,
	onAbrirCuotas,
}: {
	periodo: PeriodoDashboard;
	onPeriodoChange: (p: PeriodoDashboard) => void;
	onAbrirCuotas?: () => void;
}) {
	const { cacheScope, profileStatus, perfil, user, isSigningOut } = useAuth();
	const enabled =
		profileStatus === 'ready' && perfil?.rol === 'admin' && !isSigningOut && Boolean(user);
	const query = useDashboard(periodo, { cacheScope, actorId: user?.id ?? '', enabled });
	const [year, setYear] = useState(String(periodo.anio));

	useEffect(() => {
		setYear(String(periodo.anio));
	}, [periodo.anio]);

	const validYear =
		periodoDashboardValido({ mes: periodo.mes, anio: Number(year) }) && /^\d{4}$/.test(year);
	if (!enabled) {
		return null;
	}

	return (
		<Stack spacing={3}>
			<PageHeader
				title="Panel de control financiero"
				subtitle="Situación actual del club y resultados del período elegido."
				actions={
					<>
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
							sx={{ width: 100 }}
						/>
						<Button
							variant="outlined"
							startIcon={<RefreshOutlinedIcon />}
							onClick={() => void query.refetch()}
							disabled={query.isFetching}
						>
							Actualizar
						</Button>
					</>
				}
			/>

			{query.isFetching && (
				<Box role="status">
					<LinearProgress aria-label="Consultando indicadores del dashboard" />
					<Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
						{query.data ? 'Actualizando indicadores…' : 'Consultando indicadores…'}
					</Typography>
				</Box>
			)}

			{query.isError && (
				<Alert
					severity="error"
					action={
						<Button size="small" color="inherit" onClick={() => void query.refetch()}>
							Reintentar
						</Button>
					}
				>
					{query.error instanceof Error
						? query.error.message
						: 'No pudimos consultar los indicadores del panel. Volvé a intentar.'}
				</Alert>
			)}

			{!query.isError && query.data && (
				<DashboardData data={query.data} {...(onAbrirCuotas ? { onAbrirCuotas } : {})} />
			)}
		</Stack>
	);
}

function LinkedKpi({
	label,
	value,
	caption,
	to,
	tone,
}: {
	label: string;
	value: string;
	caption: string;
	to: string;
	tone: KpiTone;
}) {
	return (
		<Box
			component={Link}
			to={to}
			sx={{
				textDecoration: 'none',
				color: 'inherit',
				display: 'block',
				height: '100%',
				borderRadius: 1.25,
				'& .MuiPaper-root': {
					transition: 'background-color 140ms ease, border-color 140ms ease',
				},
				'&:hover .MuiPaper-root': {
					bgcolor: 'action.hover',
				},
				'&:focus-visible': {
					outline: '2px solid',
					outlineColor: 'primary.main',
					outlineOffset: 2,
				},
			}}
		>
			<KpiCard label={label} value={value} caption={caption} tone={tone} />
		</Box>
	);
}

function DashboardData({ data, onAbrirCuotas }: { data: Dashboard; onAbrirCuotas?: () => void }) {
	const links = enlacesDashboard(data.periodo),
		p = periodLabel(data.periodo),
		net = Number(data.finanzas.neto),
		deuda = Number(data.actuales.deudaTotal);

	return (
		<>
			<Typography variant="caption" color="text.secondary" sx={{ mt: -1.5 }}>
				Última actualización: {shortDate.format(new Date(data.consultadoEn))} · Hora del club
				(Buenos Aires).
			</Typography>

			<Box
				sx={{
					display: 'grid',
					gridTemplateColumns: {
						xs: '1fr',
						sm: 'repeat(2, minmax(0, 1fr))',
						xl: 'repeat(4, minmax(0, 1fr))',
					},
					gap: 2,
				}}
			>
				<LinkedKpi
					label="Socios activos"
					value={integer.format(data.actuales.sociosActivos)}
					caption="Activos hoy, con o sin inscripción vigente."
					to={links.activos}
					tone="primary"
				/>
				<LinkedKpi
					label="Socios morosos"
					value={integer.format(data.actuales.sociosMorosos)}
					caption="Con cuotas pendientes de más de 30 días."
					to={links.morosos}
					tone={data.actuales.sociosMorosos > 0 ? 'error' : 'success'}
				/>
				<LinkedKpi
					label="Deuda total pendiente"
					value={money(data.actuales.deudaTotal)}
					caption="En plazo y en mora (socios activos e inactivos)."
					to={links.deuda}
					tone={deuda > 0 ? 'warning' : 'success'}
				/>
				<LinkedKpi
					label={`Resultado neto · ${p}`}
					value={money(data.finanzas.neto)}
					caption="Incluye anulaciones del período; no es el saldo acumulado."
					to={links.movimientos}
					tone={net > 0 ? 'success' : net < 0 ? 'error' : 'neutral'}
				/>
			</Box>

			<Box
				sx={{
					display: 'grid',
					gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1.5fr) minmax(0, 1fr)' },
					gap: 2,
				}}
			>
				<MonthlyChart months={data.meses} />
				<DebtDistribution rows={data.morosidadPorDeporte} />
			</Box>

			<OperationalAlerts data={data} {...(onAbrirCuotas ? { onAbrirCuotas } : {})} />

			<Paper variant="outlined" sx={{ p: 2.5 }}>
				<Stack
					direction={{ xs: 'column', md: 'row' }}
					spacing={2}
					sx={{ justifyContent: 'space-between', alignItems: { md: 'center' } }}
				>
					<Box>
						<Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
							<Typography component="h2" variant="h6">
								Resumen financiero de {p}
							</Typography>
							<InfoTooltip
								label="Cómo se calcula el resumen del período"
								title="Las anulaciones ajustan el resultado neto en su fecha efectiva y no se suman como nuevos ingresos ni egresos originales."
							/>
						</Stack>
						<Typography variant="body2" color="text.secondary">
							{integer.format(data.finanzas.movimientos)}{' '}
							{data.finanzas.movimientos === 1
								? 'movimiento registrado'
								: 'movimientos registrados'}
							, incluidas las anulaciones del período.
						</Typography>
					</Box>
					<Button component={Link} to={links.pagos} variant="outlined" size="small">
						Ver cobros del período
					</Button>
				</Stack>
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
						gap: 2,
						mt: 2,
						pt: 2,
						borderTop: 1,
						borderColor: 'divider',
					}}
				>
					<Box>
						<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
							Ingresos originales
						</Typography>
						<Typography
							variant="h6"
							color="success.main"
							sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
						>
							{money(data.finanzas.ingresosOriginales)}
						</Typography>
					</Box>
					<Box>
						<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
							Egresos originales
						</Typography>
						<Typography variant="h6" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
							{money(data.finanzas.egresosOriginales)}
						</Typography>
					</Box>
					<Box>
						<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
							Resultado neto (con anulaciones)
						</Typography>
						<Typography
							variant="h6"
							color={net > 0 ? 'success.main' : net < 0 ? 'error.main' : 'text.primary'}
							sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
						>
							{money(data.finanzas.neto)}
						</Typography>
					</Box>
				</Box>
			</Paper>
		</>
	);
}

function MonthlyChart({ months }: { months: MesDashboard[] }) {
	const theme = useTheme();
	const palette = theme.palette.mode === 'dark' ? DARK_COLORS : LIGHT_COLORS;
	const max = Math.max(
		0,
		...months.flatMap((m) => [Number(m.ingresosOriginales), Number(m.egresosOriginales)]),
	);

	return (
		<Paper variant="outlined" sx={{ p: 2.5, minWidth: 0 }}>
			<Stack
				direction={{ xs: 'column', sm: 'row' }}
				spacing={1}
				sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 1.5 }}
			>
				<Box>
					<Typography component="h2" variant="h6">
						Flujo de los últimos seis meses
					</Typography>
					<Typography variant="caption" color="text.secondary">
						Hasta {months[5] ? periodLabel(months[5]) : ''}. Ingresos y egresos originales.
					</Typography>
				</Box>
				<Stack direction="row" spacing={2}>
					<Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
						<Box
							component="span"
							sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: palette[0] }}
						/>
						Ingresos
					</Typography>
					<Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
						<Box
							component="span"
							sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: palette[1] }}
						/>
						Egresos
					</Typography>
				</Stack>
			</Stack>

			{max === 0 ? (
				<EmptyState
					title="Sin movimientos en estos seis meses"
					description="Cuando registres cobros o gastos dentro de este rango, verás la evolución mensual acá."
				/>
			) : (
				<Box
					component="svg"
					role="img"
					aria-label="Comparación mensual de ingresos y egresos originales; importes en la tabla siguiente"
					viewBox="0 0 720 250"
					sx={{ width: '100%', height: 'auto', display: 'block', color: 'text.secondary' }}
				>
					<title>Ingresos y egresos originales de seis meses</title>
					<line x1="12" y1="70" x2="710" y2="70" stroke="currentColor" opacity="0.12" />
					<line x1="12" y1="140" x2="710" y2="140" stroke="currentColor" opacity="0.12" />
					<line x1="12" y1="210" x2="710" y2="210" stroke="currentColor" opacity="0.3" />
					{months.map((m, i) => {
						const hIng = (Number(m.ingresosOriginales) / max) * 185;
						const hEgr = (Number(m.egresosOriginales) / max) * 185;
						return (
							<g key={`${m.anio}-${m.mes}`}>
								<rect
									x={27 + i * 116}
									y={210 - hIng}
									width="34"
									height={hIng}
									rx="4"
									fill={palette[0]}
								>
									<title>
										{periodLabel(m)}: ingresos {money(m.ingresosOriginales)}
									</title>
								</rect>
								<rect
									x={65 + i * 116}
									y={210 - hEgr}
									width="34"
									height={hEgr}
									rx="4"
									fill={palette[1]}
								>
									<title>
										{periodLabel(m)}: egresos {money(m.egresosOriginales)}
									</title>
								</rect>
								<text
									x={63 + i * 116}
									y="236"
									textAnchor="middle"
									fill="currentColor"
									fontSize="14"
								>
									{monthNames[m.mes - 1]?.slice(0, 3)} {String(m.anio).slice(-2)}
								</text>
							</g>
						);
					})}
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
						{months.map((m) => {
							const netoMes = Number(m.neto);
							return (
								<TableRow key={`${m.anio}-${m.mes}`}>
									<TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
										{periodLabel(m)}
									</TableCell>
									<TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
										{money(m.ingresosOriginales)}
									</TableCell>
									<TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
										{money(m.egresosOriginales)}
									</TableCell>
									<TableCell
										align="right"
										sx={{
											whiteSpace: 'nowrap',
											fontWeight: 600,
											color:
												netoMes > 0 ? 'success.main' : netoMes < 0 ? 'error.main' : 'text.primary',
										}}
									>
										{money(m.neto)}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</TableContainer>
			<Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25 }}>
				El neto incluye las anulaciones de cada mes; por eso puede diferir de restar ambas barras.
			</Typography>
		</Paper>
	);
}

function DebtDistribution({ rows }: { rows: Dashboard['morosidadPorDeporte'] }) {
	const theme = useTheme();
	const palette = theme.palette.mode === 'dark' ? DARK_COLORS : LIGHT_COLORS;
	const total = rows.reduce((n, row) => n + Number(row.deudaMorosa), 0);
	let angle = 0;
	const stops = rows.map((row, i) => {
		const start = angle;
		angle += total > 0 ? (Number(row.deudaMorosa) / total) * 100 : 0;
		return `${palette[i % palette.length]} ${start}% ${angle}%`;
	});

	return (
		<Paper variant="outlined" sx={{ p: 2.5, minWidth: 0 }}>
			<Typography component="h2" variant="h6">
				Morosidad por deporte
			</Typography>
			<Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
				Cuotas vencidas de más de 30 días. Situación actual.
			</Typography>
			{total === 0 ? (
				<EmptyState
					tone="success"
					icon={<CheckCircleOutlineIcon />}
					title="Sin deuda en mora"
					description="No hay cuotas vencidas de más de 30 días en ningún deporte."
				/>
			) : (
				<>
					<Box
						role="img"
						aria-label="Distribución de la deuda en mora por deporte; importes en la tabla siguiente"
						sx={{
							mx: 'auto',
							my: 2,
							width: 176,
							height: 176,
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
													borderRadius: 0.5,
													bgcolor: palette[i % palette.length],
													mr: 1,
												}}
											/>
											{row.deporte}
										</TableCell>
										<TableCell align="right">{integer.format(row.cuotasMorosas)}</TableCell>
										<TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
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

function OperationalAlerts({
	data,
	onAbrirCuotas,
}: {
	data: Dashboard;
	onAbrirCuotas?: () => void;
}) {
	const links = enlacesDashboard(data.periodo),
		a = data.alertas,
		job = a.ultimoJob,
		c = a.certificado;

	const fiscalPendientesTotal =
		a.comprobantesPendientes + a.comprobantesFallidos + a.anulacionesPendientes;
	const hasEmailIssue = a.emailsInvalidos > 0;
	const hasFiscalIssue = fiscalPendientesTotal > 0;
	const hasJobIssue = job?.estado !== 'exitoso';
	const hasCertIssue = c.estado !== 'vigente';
	const hasAnyIssue = hasEmailIssue || hasFiscalIssue || hasJobIssue || hasCertIssue;

	const certVencimiento = formatIsoDateArg(c.vencimiento);
	const certText =
		c.estado === 'ausente'
			? 'Falta configurar el certificado fiscal ARCA.'
			: c.estado === 'vencido'
				? `El certificado fiscal ARCA venció el ${certVencimiento}.`
				: c.estado === 'proximo'
					? `El certificado fiscal ARCA vence ${c.diasRestantes === 0 ? 'hoy' : `en ${c.diasRestantes} días`} (${certVencimiento}).`
					: `Certificado ARCA vigente hasta el ${certVencimiento}.`;

	const jobSummary = job
		? `Última generación (${String(job.periodoMes).padStart(2, '0')}/${job.periodoAnio}): ${integer.format(job.cuotasGeneradas)} creadas y ${integer.format(job.cuotasOmitidas)} ya existentes.`
		: 'Todavía no hay generaciones mensuales registradas.';

	const openCuotasAction = onAbrirCuotas ? (
		<Button size="small" color="inherit" onClick={onAbrirCuotas}>
			Ver generación
		</Button>
	) : (
		<Button size="small" color="inherit" href={links.cuotas}>
			Ver generación
		</Button>
	);

	return (
		<Paper variant="outlined" sx={{ p: 2.5 }}>
			<Typography component="h2" variant="h6" sx={{ mb: 1.5 }}>
				Alertas y tareas pendientes
			</Typography>

			{!hasAnyIssue ? (
				<Alert
					severity="success"
					action={
						<Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
							{onAbrirCuotas ? (
								<Button size="small" color="inherit" onClick={onAbrirCuotas}>
									Generar cuotas
								</Button>
							) : (
								<Button size="small" color="inherit" href={links.cuotas}>
									Generar cuotas
								</Button>
							)}
							<Button size="small" color="inherit" component={Link} to={links.fiscal}>
								Monitoreo fiscal
							</Button>
						</Stack>
					}
				>
					<Typography variant="body2" sx={{ fontWeight: 700 }}>
						Todo al día
					</Typography>
					<Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>
						Sin incidencias fiscales ni correos inválidos · {certText} · {jobSummary}
					</Typography>
				</Alert>
			) : (
				<Stack spacing={1.5}>
					{hasCertIssue && (
						<Alert
							severity={
								c.estado === 'vencido' ? 'error' : c.estado === 'proximo' ? 'warning' : 'info'
							}
							action={
								<Button size="small" color="inherit" component={Link} to={links.configuracion}>
									Configurar
								</Button>
							}
						>
							{certText}
						</Alert>
					)}

					{hasFiscalIssue && (
						<Alert
							severity={a.comprobantesFallidos > 0 ? 'error' : 'warning'}
							action={
								<Button size="small" color="inherit" component={Link} to={links.fiscal}>
									Ir a monitoreo
								</Button>
							}
						>
							{integer.format(a.comprobantesPendientes)} pendientes de ARCA ·{' '}
							{integer.format(a.comprobantesFallidos)} con error ·{' '}
							{integer.format(a.anulacionesPendientes)} anulaciones fiscales pendientes.
						</Alert>
					)}

					{hasEmailIssue && (
						<Alert
							severity="warning"
							action={
								<Button size="small" color="inherit" component={Link} to={links.emailsInvalidos}>
									Ver socios
								</Button>
							}
						>
							{integer.format(a.emailsInvalidos)}{' '}
							{a.emailsInvalidos === 1
								? 'socio tiene el correo marcado como inválido.'
								: 'socios tienen el correo marcado como inválido.'}
						</Alert>
					)}

					{hasJobIssue && (
						<Alert
							severity={!job ? 'info' : job.estado === 'fallido' ? 'error' : 'warning'}
							action={openCuotasAction}
						>
							{!job ? (
								'Todavía no hay generaciones mensuales registradas.'
							) : (
								<>
									<strong>
										Última generación ({String(job.periodoMes).padStart(2, '0')}/{job.periodoAnio}):{' '}
										{job.estado === 'fallido' ? 'fallida' : 'en proceso'}.
									</strong>{' '}
									Inicio: {shortDate.format(new Date(job.fechaInicio))}.
								</>
							)}
						</Alert>
					)}

					{(!hasCertIssue || !hasFiscalIssue || !hasEmailIssue || !hasJobIssue) && (
						<Typography variant="caption" color="text.secondary" sx={{ pt: 0.25 }}>
							En orden:{' '}
							{[
								!hasCertIssue ? certText : null,
								!hasFiscalIssue ? 'sin incidencias fiscales' : null,
								!hasEmailIssue ? 'sin correos inválidos' : null,
								!hasJobIssue ? jobSummary : null,
							]
								.filter(Boolean)
								.join(' · ')}
						</Typography>
					)}
				</Stack>
			)}
		</Paper>
	);
}
