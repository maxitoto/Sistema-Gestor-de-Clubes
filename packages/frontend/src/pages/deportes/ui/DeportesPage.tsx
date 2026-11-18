import { Stack } from '@mui/material';
import { GenerarCuotasPanel } from '#features/generar-cuotas';
import { DeportesPanel } from '#widgets/deportes-panel';
export function DeportesPage() {
	return (
		<Stack spacing={3}>
			<DeportesPanel />
			<GenerarCuotasPanel />
		</Stack>
	);
}
