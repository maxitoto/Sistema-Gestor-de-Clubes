import { Box, Stack } from '@mui/material';
import { useState } from 'react';
import { diasPeriodoDashboard, periodoDashboardActual } from '#entities/dashboard';
import { useAuth } from '#entities/session';
import { GenerarCuotasPanel } from '#features/generar-cuotas';
import { CajaPanel } from '#widgets/caja-panel';
import { FinancialDashboard } from '#widgets/financial-dashboard';

export function DashboardPage() {
	const { cacheScope, profileStatus, perfil, isSigningOut } = useAuth();
	if (profileStatus !== 'ready' || perfil?.rol !== 'admin' || isSigningOut) {
		return null;
	}
	return <DashboardContent key={cacheScope} />;
}
function DashboardContent() {
	const [periodo, setPeriodo] = useState(periodoDashboardActual);
	return (
		<Stack spacing={3}>
			<FinancialDashboard periodo={periodo} onPeriodoChange={setPeriodo} />
			<CajaPanel periodo={diasPeriodoDashboard(periodo)} />
			<Box id="cuotas-mensuales" sx={{ scrollMarginTop: 100 }}>
				<GenerarCuotasPanel />
			</Box>
		</Stack>
	);
}
