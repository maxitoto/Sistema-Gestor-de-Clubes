import {
	Alert,
	Box,
	Button,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Stack,
	Typography,
} from '@mui/material';
import { type FormEvent, useId, useState } from 'react';
import { type SocioCreado, SocioFields } from '#entities/socio';
import {
	formularioSocioInicial,
	type SocioForm,
	type SocioFormErrors,
	validarSocioForm,
} from '../model/socioForm';
import { useCreateSocio } from '../model/useCreateSocio';

export interface CreateSocioDialogProps {
	open: boolean;
	onClose: () => void;
	onCreated?: (socio: SocioCreado) => void;
	onVerifyExisting?: (socio: SocioCreado) => void;
}

export function CreateSocioDialog({
	open,
	onClose,
	onCreated,
	onVerifyExisting,
}: CreateSocioDialogProps) {
	const titleId = useId();
	const [form, setForm] = useState(formularioSocioInicial);
	const [errors, setErrors] = useState<SocioFormErrors>({});
	const [showExisting, setShowExisting] = useState(false);
	const mutation = useCreateSocio((socio) => {
		setForm(formularioSocioInicial());
		setErrors({});
		setShowExisting(false);
		onCreated?.(socio);
		onClose();
	});
	const change = (name: keyof SocioForm, value: string | boolean) => {
		mutation.clearRecoverableFeedback();
		setForm((previous) => ({ ...previous, [name]: value }));
		setErrors((previous) => ({ ...previous, [name]: undefined }));
	};
	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		mutation.clearRecoverableFeedback();
		const validation = validarSocioForm(form);
		if (!validation.valid) {
			setErrors(validation.errors);
			return;
		}
		setErrors({});
		void mutation.create(validation.payload);
	};
	return (
		<Dialog
			open={open}
			fullWidth
			maxWidth="md"
			aria-labelledby={titleId}
			onClose={() => {
				if (!mutation.isPending) {
					onClose();
				}
			}}
		>
			<Box
				component="form"
				noValidate
				onSubmit={submit}
				sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
			>
				<DialogTitle id={titleId} sx={{ px: { xs: 2, sm: 3 }, pt: 3, pb: 2 }}>
					Alta de socio
					<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
						Completá la ficha personal. Los campos con * son obligatorios.
					</Typography>
				</DialogTitle>
				<DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, py: 3 }}>
					<Stack spacing={3}>
						{!mutation.enabled && (
							<Alert severity="warning">Necesitás una sesión operativa activa para guardar.</Alert>
						)}
						{mutation.feedback && (
							<Alert severity={mutation.feedback.kind === 'permission' ? 'error' : 'warning'}>
								{mutation.feedback.message}
							</Alert>
						)}
						{mutation.feedback?.dni &&
							['duplicate', 'uncertain_pending'].includes(mutation.feedback.kind) && (
								<Button
									onClick={() => {
										void mutation.checkExisting();
									}}
									disabled={mutation.isPending || !mutation.enabled}
								>
									Consultar DNI {mutation.feedback.dni}
								</Button>
							)}
						{mutation.feedback?.existing && (
							<Box>
								<Button
									disabled={!mutation.enabled}
									onClick={() => {
										const existing = mutation.feedback?.existing;
										if (existing) {
											setShowExisting(true);
											onVerifyExisting?.(existing);
										}
									}}
								>
									Verificar socio existente
								</Button>
								{showExisting && (
									<Alert severity="info">
										Registro existente: socio n.º {mutation.feedback.existing.numero_socio},{' '}
										{mutation.feedback.existing.apellido}, {mutation.feedback.existing.nombre}; DNI{' '}
										{mutation.feedback.existing.dni}. Esta verificación no confirma que el intento
										de alta lo haya creado.
									</Alert>
								)}
							</Box>
						)}
						<SocioFields
							form={form}
							errors={errors}
							onChange={change}
							disabled={mutation.isPending}
						/>
					</Stack>
				</DialogContent>
				<DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 2, gap: 1, flexWrap: 'wrap' }}>
					{mutation.feedback?.existing && (
						<Button
							disabled={mutation.isPending || !mutation.enabled}
							onClick={() => {
								mutation.resetForNew();
								setForm(formularioSocioInicial());
								setErrors({});
								setShowExisting(false);
							}}
						>
							Iniciar otra alta
						</Button>
					)}
					<Button disabled={mutation.isPending} onClick={onClose}>
						Cancelar
					</Button>
					<Button
						type="submit"
						variant="contained"
						disabled={mutation.isPending || !mutation.enabled || mutation.requiresCheck}
						startIcon={
							mutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined
						}
					>
						{mutation.isPending ? 'Procesando…' : 'Guardar socio'}
					</Button>
				</DialogActions>
			</Box>
		</Dialog>
	);
}
