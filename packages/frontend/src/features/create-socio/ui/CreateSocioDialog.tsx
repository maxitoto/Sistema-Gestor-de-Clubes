import {
	Alert,
	Box,
	Button,
	Checkbox,
	Chip,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Divider,
	FormControlLabel,
	Stack,
	TextField,
	Typography,
} from '@mui/material';
import { type FormEvent, useId, useState } from 'react';
import type { SocioCreado } from '#entities/socio';
import {
	edadSocio,
	fechaBuenosAires,
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
	const age = edadSocio(form.fecha_nacimiento);
	const minor = (age ?? 18) < 18;
	const field = (
		name: Exclude<keyof SocioForm, 'acepta_comunicaciones'>,
		label: string,
		maximum?: number,
		required = false,
	) => (
		<TextField
			key={name}
			label={label}
			value={form[name]}
			onChange={(event) => change(name, event.target.value)}
			error={Boolean(errors[name])}
			helperText={errors[name]}
			required={required}
			disabled={mutation.isPending}
			fullWidth
			slotProps={{ htmlInput: maximum ? { maxLength: maximum } : {} }}
		/>
	);
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
						<Box component="section" aria-label="Datos personales">
							<Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 700 }}>
								Datos personales
							</Typography>
							<Box
								sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}
							>
								{field('dni', 'DNI / Documento', 20, true)}
								<TextField
									label="N.º de socio (matrícula)"
									value="Se asigna al guardar"
									disabled
									fullWidth
								/>
								{field('nombre', 'Nombre', 100, true)}
								{field('apellido', 'Apellido', 100, true)}
								<TextField
									label="Fecha de nacimiento"
									type="date"
									value={form.fecha_nacimiento}
									onChange={(event) => change('fecha_nacimiento', event.target.value)}
									required
									fullWidth
									disabled={mutation.isPending}
									error={Boolean(errors.fecha_nacimiento)}
									helperText={errors.fecha_nacimiento}
									slotProps={{
										inputLabel: { shrink: true },
										htmlInput: { max: fechaBuenosAires() },
									}}
								/>
								{age !== null && (
									<Box sx={{ display: 'flex', alignItems: 'flex-start', pt: 0.75 }}>
										<Chip
											label={minor ? `Menor de edad · ${age} años` : `${age} años`}
											color={minor ? 'primary' : 'default'}
											variant="outlined"
											size="small"
										/>
									</Box>
								)}
							</Box>
						</Box>
						<Divider />
						<Box component="section" aria-label="Información de contacto y preferencias">
							<Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 700 }}>
								Información de contacto y preferencias
							</Typography>
							<Box
								sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}
							>
								{field('email', 'Correo electrónico (opcional)', 255)}
								{field('telefono', 'Teléfono (opcional)', 50)}
								<Box sx={{ gridColumn: '1 / -1' }}>
									{field('direccion', 'Dirección / Domicilio (opcional)')}
								</Box>
							</Box>
							<FormControlLabel
								sx={{ mt: 1 }}
								control={
									<Checkbox
										checked={form.acepta_comunicaciones}
										onChange={(event) => change('acepta_comunicaciones', event.target.checked)}
										disabled={mutation.isPending}
									/>
								}
								label="Acepta comunicaciones del club"
							/>
						</Box>
						<Box
							component="section"
							aria-label="Contacto de emergencia"
							sx={{
								p: 2,
								border: '1px solid',
								borderColor: minor ? 'primary.main' : 'divider',
								borderRadius: 2,
								bgcolor: 'action.hover',
							}}
						>
							<Typography
								variant="subtitle1"
								color={minor ? 'primary.main' : 'text.primary'}
								sx={{ fontWeight: 700 }}
							>
								Contacto de emergencia
							</Typography>
							<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
								{minor ? 'Obligatorio para menores de 18 años.' : 'Opcional para mayores de edad.'}
							</Typography>
							<Box
								sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}
							>
								{field(
									'contacto_emergencia_nombre',
									'Nombre del contacto de emergencia',
									150,
									minor,
								)}
								{field(
									'contacto_emergencia_telefono',
									'Teléfono del contacto de emergencia',
									50,
									minor,
								)}
							</Box>
						</Box>
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
