import { Box } from '@mui/material';
import { RecoverPasswordForm } from '#features/recover-password';

export function RecoverPasswordPage() {
	return (
		<Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
			<Box sx={{ width: '100%', maxWidth: 560 }}>
				<RecoverPasswordForm />
			</Box>
		</Box>
	);
}
