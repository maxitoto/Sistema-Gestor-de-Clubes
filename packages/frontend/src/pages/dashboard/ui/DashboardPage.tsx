import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
	Accordion,
	AccordionDetails,
	AccordionSummary,
	Box,
	Chip,
	Stack,
	Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { diasPeriodoDashboard, periodoDashboardActual } from '#entities/dashboard';
import { useAuth } from '#entities/session';
import { GenerarCuotasPanel } from '#features/generar-cuotas';
import { CajaPanel } from '#widgets/caja-panel';
import { FinancialDashboard } from '#widgets/financial-dashboard';

const MONTH_NAMES = [
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

export function DashboardPage() {
	const { cacheScope, profileStatus, perfil, isSigningOut } = useAuth();
	if (profileStatus !== 'ready' || perfil?.rol !== 'admin' || isSigningOut) {
		return null;
	}
	return <DashboardContent key={cacheScope} />;
}

function DashboardContent() {
	const { hash } = useLocation();
	const [periodo, setPeriodo] = useState(periodoDashboardActual);
	const [cajaOpen, setCajaOpen] = useState(false);
	const [cuotasOpen, setCuotasOpen] = useState(() => hash === '#cuotas-mensuales');

	useEffect(() => {
		if (hash === '#cuotas-mensuales') {
			setCuotasOpen(true);
		}
	}, [hash]);

	const abrirCuotas = useCallback(() => {
		setCuotasOpen(true);
		requestAnimationFrame(() => {
			document.getElementById('cuotas-mensuales')?.scrollIntoView({ behavior: 'smooth' });
		});
	}, []);

	const periodoLabel = `${MONTH_NAMES[periodo.mes - 1] ?? ''} ${periodo.anio}`.trim();

	return (
		<Stack spacing={3}>
			<FinancialDashboard
				periodo={periodo}
				onPeriodoChange={setPeriodo}
				onAbrirCuotas={abrirCuotas}
			/>

			<Accordion
				variant="outlined"
				disableGutters
				expanded={cajaOpen}
				onChange={(_, expanded) => setCajaOpen(expanded)}
				sx={{
					borderRadius: '10px !important',
					overflow: 'hidden',
					'&::before': { display: 'none' },
				}}
			>
				<AccordionSummary
					expandIcon={<ExpandMoreIcon />}
					aria-controls="dashboard-caja-content"
					id="dashboard-caja-header"
					sx={{ px: { xs: 2, sm: 3 }, py: 1.25 }}
				>
					<Stack
						direction={{ xs: 'column', sm: 'row' }}
						spacing={1.5}
						sx={{
							width: '100%',
							pr: 1.5,
							alignItems: { sm: 'center' },
							justifyContent: 'space-between',
						}}
					>
						<Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
							<AccountBalanceWalletOutlinedIcon color="primary" />
							<Box sx={{ minWidth: 0 }}>
								<Typography component="h2" variant="subtitle1" sx={{ fontWeight: 700 }}>
									Movimientos de caja del período
								</Typography>
								<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
									Consultá ingresos, egresos y anulaciones con sus fechas efectivas.
								</Typography>
							</Box>
						</Stack>
						<Chip
							size="small"
							variant="outlined"
							label={periodoLabel}
							sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}
						/>
					</Stack>
				</AccordionSummary>
				<AccordionDetails
					id="dashboard-caja-content"
					sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 3 }, pt: 1 }}
				>
					<CajaPanel periodo={diasPeriodoDashboard(periodo)} embedded />
				</AccordionDetails>
			</Accordion>

			<Box id="cuotas-mensuales" sx={{ scrollMarginTop: 100 }}>
				<Accordion
					variant="outlined"
					disableGutters
					expanded={cuotasOpen}
					onChange={(_, expanded) => setCuotasOpen(expanded)}
					sx={{
						borderRadius: '10px !important',
						overflow: 'hidden',
						'&::before': { display: 'none' },
					}}
				>
					<AccordionSummary
						expandIcon={<ExpandMoreIcon />}
						aria-controls="dashboard-cuotas-content"
						id="dashboard-cuotas-header"
						sx={{ px: { xs: 2, sm: 3 }, py: 1.25 }}
					>
						<Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
							<CalendarMonthOutlinedIcon color="primary" />
							<Box sx={{ minWidth: 0 }}>
								<Typography component="h2" variant="subtitle1" sx={{ fontWeight: 700 }}>
									Generación mensual de cuotas
								</Typography>
								<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
									Emití las cuotas del mes actual y consultá el historial de generaciones.
								</Typography>
							</Box>
						</Stack>
					</AccordionSummary>
					<AccordionDetails
						id="dashboard-cuotas-content"
						sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 3 }, pt: 1 }}
					>
						<GenerarCuotasPanel embedded />
					</AccordionDetails>
				</Accordion>
			</Box>
		</Stack>
	);
}
