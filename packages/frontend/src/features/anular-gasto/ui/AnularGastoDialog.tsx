import {
	Alert,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Stack,
	TextField,
	Typography,
} from '@mui/material';
import { useState } from 'react';
import {
	anularGasto,
	coincideAnulacionGasto,
	errorGasto,
	type Gasto,
	getGasto,
	monedaGasto,
} from '#entities/gasto';
import { useAuth } from '#entities/session';
import { useVerifiedMutation } from '#shared/lib/useVerifiedMutation';
export function AnularGastoDialog({
	gasto,
	onClose,
	onSaved,
}: {
	gasto: Gasto;
	onClose: () => void;
	onSaved: (g: Gasto) => void;
}) {
	const { cacheScope, profileStatus, perfil } = useAuth();
	const [motivo, setMotivo] = useState('');
	const [error, setError] = useState<string | null>(null);
	const mutation = useVerifiedMutation<{ motivo: string }, Gasto>({
		cacheScope,
		enabled: profileStatus === 'ready',
		queryRoots: ['gastos', 'gasto', 'caja', 'movimientos-caja'],
		write: (input, signal) => anularGasto(gasto.id, input.motivo, perfil?.id ?? '', signal),
		read: (signal) => getGasto(gasto.id, signal),
		matches: (row, payload) => coincideAnulacionGasto(row, payload.motivo, perfil?.id ?? ''),
		onConfirmed: onSaved,
		describeError: errorGasto,
	});
	const confirm = () => {
		if (!motivo.trim()) {
			setError('Completá el motivo de anulación.');
			return;
		}
		void mutation.run({ motivo: motivo.trim() });
	};
	return (
		<Dialog
			open
			fullWidth
			maxWidth="sm"
			onClose={() => {
				if (!mutation.isPending) {
					onClose();
				}
			}}
		>
			<DialogTitle>Anular gasto</DialogTitle>
			<DialogContent>
				<Stack spacing={2} sx={{ pt: 1 }}>
					<Typography>
						{gasto.concepto} · {monedaGasto(gasto.monto)}
					</Typography>
					<Alert severity="warning">
						Se conservará el gasto original y se registrará su anulación con motivo. El movimiento
						de devolución se verá en la fecha de anulación.
					</Alert>
					{mutation.feedback && <Alert severity="warning">{mutation.feedback}</Alert>}
					<TextField
						label="Motivo de anulación"
						required
						multiline
						minRows={3}
						value={motivo}
						onChange={(e) => setMotivo(e.target.value)}
						disabled={mutation.isPending || mutation.requiresCheck}
						error={!!error}
						helperText={error}
					/>
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button disabled={mutation.isPending} onClick={onClose}>
					Cancelar
				</Button>
				{mutation.requiresCheck ? (
					<Button disabled={mutation.isPending} onClick={() => void mutation.reconcile()}>
						Consultar resultado
					</Button>
				) : (
					<Button
						variant="contained"
						color="error"
						disabled={mutation.isPending || !mutation.enabled}
						onClick={confirm}
					>
						Confirmar anulación
					</Button>
				)}
			</DialogActions>
		</Dialog>
	);
}
