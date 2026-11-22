import { Box } from '@mui/material';
import { DesuscribirCard } from '#features/desuscribir-correo';

export function DesuscribirPage() {
	return (
		<Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
			<Box sx={{ width: '100%', maxWidth: 560 }}>
				<DesuscribirCard />
			</Box>
		</Box>
	);
}
