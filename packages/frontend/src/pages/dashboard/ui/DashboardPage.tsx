// src/pages/dashboard/ui/DashboardPage.tsx
import { Box, Typography } from '@mui/material';
import { DashboardPanel } from '#widgets/dashboard-panel';

export function DashboardPage() {
	return (
		<Box>
			<Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 'bold' }}>
				Dashboard del Club
			</Typography>

			<DashboardPanel />
		</Box>
	);
}
