import { Button, Paper, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
export function DashboardPanel() {
	return (
		<Paper variant="outlined" sx={{ p: 3, mt: 3 }}>
			<Stack spacing={2}>
				<Typography component="h2" variant="h6">
					Gestión del club
				</Typography>
				<Typography>
					Accedé al padrón para consultar socios o a Comunicaciones para preparar y seguir los
					avisos.
				</Typography>
				<Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
					<Button component={Link} to="/socios" variant="outlined">
						Consultar socios
					</Button>
					<Button component={Link} to="/comunicaciones" variant="contained">
						Abrir comunicaciones
					</Button>
				</Stack>
			</Stack>
		</Paper>
	);
}
