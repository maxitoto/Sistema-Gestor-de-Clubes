import {
	Alert,
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Stack,
	TextField,
	Typography,
} from '@mui/material';
import { type FormEvent, useId, useState } from 'react';
import {
	actualizarDeporte,
	type CrearDeportePayload,
	type Deporte,
	type DeporteForm,
	type DeporteFormErrors,
	describirErrorDeporte,
	getDeporte,
	validarDeporteForm,
} from '#entities/deporte';
import { useAuth } from '#entities/session';
import { useVerifiedMutation } from '#shared/lib/useVerifiedMutation';

export function EditDeporteDialog({
	deporte,
	onClose,
	onSaved,
}: {
	deporte: Deporte;
	onClose: () => void;
	onSaved: (row: Deporte) => void;
}) {
	const titleId = useId();
	const { cacheScope, profileStatus, perfil, isSigningOut } = useAuth();
	const [form, setForm] = useState<DeporteForm>({
		nombre: deporte.nombre,
		descripcion: deporte.descripcion ?? '',
	});
	const [errors, setErrors] = useState<DeporteFormErrors>({});
	const mutation = useVerifiedMutation<CrearDeportePayload, Deporte>({
		cacheScope,
		enabled:
			profileStatus === 'ready' &&
			perfil?.rol === 'admin' &&
			perfil.estado === 'activo' &&
			!isSigningOut,
		queryRoots: ['deportes', 'categorias'],
		write: (payload, signal) => actualizarDeporte(deporte.id, payload, signal),
		read: (signal) => getDeporte(deporte.id, signal),
		matches: (row, payload) =>
			row.nombre === payload.nombre && row.descripcion === payload.descripcion,
		onConfirmed: onSaved,
		describeError: describirErrorDeporte,
	});
	const disabled = mutation.isPending || mutation.requiresCheck;
	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const result = validarDeporteForm(form);
		if (!result.valid) {
			setErrors(result.errors);
			return;
		}
		setErrors({});
		void mutation.run(result.payload);
	};
	return (
		<Dialog
			open
			fullWidth
			maxWidth="sm"
			aria-labelledby={titleId}
			onClose={() => {
				if (!mutation.isPending) {
					onClose();
				}
			}}
		>
			<Box component="form" noValidate onSubmit={submit}>
				<DialogTitle id={titleId}>Editar deporte</DialogTitle>
				<DialogContent>
					<Stack spacing={2.5} sx={{ pt: 1 }}>
						<Typography variant="body2" color="text.secondary">
							Actualizá el nombre y la descripción del deporte. Sus categorías e historial se
							conservan.
						</Typography>
						{mutation.feedback && (
							<Alert severity={mutation.requiresCheck ? 'warning' : 'error'}>
								{mutation.feedback}
							</Alert>
						)}
						{mutation.requiresCheck && (
							<Button disabled={mutation.isPending} onClick={() => void mutation.reconcile()}>
								Consultar resultado guardado
							</Button>
						)}
						<TextField
							label="Nombre del deporte"
							required
							disabled={disabled}
							value={form.nombre}
							error={Boolean(errors.nombre)}
							helperText={errors.nombre}
							slotProps={{ htmlInput: { maxLength: 100 } }}
							onChange={(event) => {
								mutation.clearFeedback();
								setErrors({});
								setForm({ ...form, nombre: event.target.value });
							}}
						/>
						<TextField
							label="Descripción (opcional)"
							multiline
							minRows={2}
							disabled={disabled}
							value={form.descripcion}
							onChange={(event) => {
								mutation.clearFeedback();
								setForm({ ...form, descripcion: event.target.value });
							}}
						/>
					</Stack>
				</DialogContent>
				<DialogActions sx={{ borderTop: 1, borderColor: 'divider' }}>
					<Button
						variant="outlined"
						color="inherit"
						disabled={mutation.isPending}
						onClick={onClose}
					>
						Cancelar
					</Button>
					<Button type="submit" variant="contained" disabled={disabled || !mutation.enabled}>
						{mutation.isPending ? 'Verificando…' : 'Guardar cambios'}
					</Button>
				</DialogActions>
			</Box>
		</Dialog>
	);
}
