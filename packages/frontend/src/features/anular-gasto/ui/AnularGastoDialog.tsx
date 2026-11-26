import {
	Alert,
	Button,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Paper,
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
			setError('Completá el motivo de la anulación.');
			return;
		}
		void mutation.run({ motivo: motivo.trim() });
	};

	return (
		<Dialog
			open
			fullWidth
			maxWidth="sm"
			aria-labelledby="anular-gasto-title"
			onClose={() => {
				if (!mutation.isPending) {
					onClose();
				}
			}}
		>
			<DialogTitle id="anular-gasto-title">Anular gasto</DialogTitle>
			<DialogContent dividers>
				<Stack spacing={2}>
					<Paper variant="outlined" sx={{ p: 1.75, bgcolor: 'action.hover' }}>
						<Stack
							direction="row"
							spacing={1.5}
							sx={{ alignItems: 'center', justifyContent: 'space-between' }}
						>
							<Typography variant="subtitle2" sx={{ fontWeight: 700, minWidth: 0 }}>
								{gasto.concepto}
							</Typography>
							<Typography
								variant="subtitle1"
								sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}
							>
								{monedaGasto(gasto.monto)}
							</Typography>
						</Stack>
					</Paper>

					<Alert severity="warning">
						El gasto original quedará visible como anulado y se registrará el asiento de anulación
						con la fecha de hoy para ajustar el resultado de caja.
					</Alert>

					{mutation.feedback && <Alert severity="warning">{mutation.feedback}</Alert>}

					<TextField
						label="Motivo de la anulación"
						placeholder="Ej. Carga duplicada o error en el importe"
						required
						multiline
						minRows={3}
						value={motivo}
						onChange={(e) => {
							setMotivo(e.target.value);
							setError(null);
						}}
						disabled={mutation.isPending || mutation.requiresCheck}
						error={!!error}
						helperText={error ?? 'Queda registrado en el historial de caja y auditoría.'}
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
						startIcon={
							mutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined
						}
						disabled={mutation.isPending || !mutation.enabled}
						onClick={confirm}
					>
						{mutation.isPending ? 'Anulando…' : 'Confirmar anulación'}
					</Button>
				)}
			</DialogActions>
		</Dialog>
	);
}
