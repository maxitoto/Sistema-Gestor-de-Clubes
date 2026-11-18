import { Box } from '@mui/material';
import { useState } from 'react';
import { parsePasswordCallback, SetPasswordForm } from '#features/set-password';

export function SetPasswordPage({ change = false }: { change?: boolean }) {
	const [callback] = useState(() => (change ? null : parsePasswordCallback(window.location.hash)));
	return (
		<Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
			<Box sx={{ width: '100%', maxWidth: 560 }}>
				<SetPasswordForm callback={callback} change={change} />
			</Box>
		</Box>
	);
}
