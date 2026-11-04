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
import type { Deporte } from '#entities/deporte';
import { type DeporteForm, type DeporteFormErrors, validarDeporteForm } from '../model/deporteForm';
import { useCreateDeporte } from '../model/useCreateDeporte';
export function CreateDeporteDialog({
	open,
	onClose,
	onCreated,
}: {
	open: boolean;
	onClose: () => void;
	onCreated: (deporte: Deporte) => void;
}) {
	const titleId = useId();
	const [form, setForm] = useState<DeporteForm>({ nombre: '', descripcion: '' });
	const [errors, setErrors] = useState<DeporteFormErrors>({});
	const mutation = useCreateDeporte((created) => {
		onCreated(created);
		onClose();
	});
	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const result = validarDeporteForm(form);
		if (!result.valid) {
			setErrors(result.errors);
			return;
		}
		setErrors({});
		void mutation.create(result.payload);
	};
	const reset = () => {
		mutation.resetForNew();
		setForm({ nombre: '', descripcion: '' });
		setErrors({});
	};
	return (
		<Dialog
			open={open}
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
				<DialogTitle id={titleId} sx={{ px: 3, pt: 3, pb: 2 }}>
					Nuevo deporte
				</DialogTitle>
				<DialogContent sx={{ px: 3 }}>
					<Stack spacing={2.5} sx={{ pt: 1 }}>
						<Typography variant="body2" color="text.secondary">
							Agregá una disciplina al catálogo del club. Se creará en estado activo.
						</Typography>
						{mutation.feedback && <Alert severity="warning">{mutation.feedback.message}</Alert>}
						{mutation.feedback?.existing && (
							<Alert severity="info">
								Ya existe el deporte {mutation.feedback.existing.nombre}. Revisá el registro antes
								de iniciar otra alta.
							</Alert>
						)}
						{mutation.requiresCheck && (
							<Button disabled={mutation.isPending} onClick={() => void mutation.checkExisting()}>
								Consultar resultado del alta
							</Button>
						)}
						<TextField
							label="Nombre del deporte"
							required
							value={form.nombre}
							onChange={(event) => setForm({ ...form, nombre: event.target.value })}
							error={Boolean(errors.nombre)}
							helperText={errors.nombre}
							disabled={mutation.isPending}
							slotProps={{ htmlInput: { maxLength: 100 } }}
						/>
						<TextField
							label="Descripción (opcional)"
							multiline
							minRows={2}
							value={form.descripcion}
							onChange={(event) => setForm({ ...form, descripcion: event.target.value })}
							disabled={mutation.isPending}
						/>
					</Stack>
				</DialogContent>
				<DialogActions
					sx={{ px: 3, py: 2.5, borderTop: 1, borderColor: 'divider', gap: 1, flexWrap: 'wrap' }}
				>
					{mutation.feedback?.existing && (
						<Button disabled={mutation.isPending} onClick={reset}>
							Iniciar otra alta
						</Button>
					)}
					<Button
						variant="outlined"
						color="inherit"
						disabled={mutation.isPending}
						onClick={onClose}
					>
						Cancelar
					</Button>
					<Button
						type="submit"
						variant="contained"
						disabled={!mutation.enabled || mutation.isPending || mutation.requiresCheck}
					>
						{mutation.isPending ? 'Procesando…' : 'Guardar deporte'}
					</Button>
				</DialogActions>
			</Box>
		</Dialog>
	);
}
