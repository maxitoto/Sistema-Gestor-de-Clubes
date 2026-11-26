import {
	Alert,
	Box,
	Button,
	CircularProgress,
	Paper,
	Stack,
	TextField,
	Typography,
} from '@mui/material';
import { type FormEvent, useState } from 'react';
import type { ClubConfig } from '#shared/types';
import { type ClubForm, type ClubFormErrors, toClubForm, validarClubForm } from '../model/clubForm';
import { useUpdateClubConfig } from '../model/useUpdateClubConfig';

export function SettingsForm({ initialData }: { initialData: ClubConfig }) {
	const [formData, setFormData] = useState(() => toClubForm(initialData));
	const [errors, setErrors] = useState<ClubFormErrors>({});
	const [saved, setSaved] = useState(false);
	const mutation = useUpdateClubConfig(() => setSaved(true));

	const change = (name: keyof ClubForm, value: string) => {
		setFormData((previous) => ({ ...previous, [name]: value }));
		setSaved(false);
		if (errors[name]) {
			setErrors((prev) => ({ ...prev, [name]: undefined }));
		}
	};

	const save = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setSaved(false);
		const validation = validarClubForm(formData);
		if (!validation.valid) {
			setErrors(validation.errors);
			return;
		}
		setErrors({});
		void mutation.run({ id: initialData.id, payload: validation.payload });
	};

	const disabled = mutation.isPending || mutation.requiresCheck;

	return (
		<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
			<Typography variant="h6" component="h2" sx={{ mb: 0.5 }}>
				Datos institucionales
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
				Esta información aparece en los comprobantes emitidos y en las comunicaciones públicas del
				club.
			</Typography>
			{mutation.feedback && (
				<Alert severity="warning" sx={{ mb: 2 }}>
					{mutation.feedback}
				</Alert>
			)}
			{saved && (
				<Alert severity="success" onClose={() => setSaved(false)} sx={{ mb: 2 }}>
					Configuración institucional guardada.
				</Alert>
			)}
			<Box component="form" noValidate onSubmit={save}>
				<Stack spacing={2.25}>
					<TextField
						label="Nombre / Razón social"
						value={formData.nombre}
						onChange={(e) => change('nombre', e.target.value)}
						error={Boolean(errors.nombre)}
						helperText={errors.nombre}
						required
						disabled={disabled}
					/>
					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: { xs: '1fr', sm: '1.3fr 1fr' },
							gap: 2,
						}}
					>
						<TextField
							label="CUIT"
							placeholder="30-12345678-1"
							value={formData.cuit}
							onChange={(e) => change('cuit', e.target.value)}
							error={Boolean(errors.cuit)}
							helperText={errors.cuit ?? 'Formato: XX-XXXXXXXX-X'}
							required
							disabled={disabled}
						/>
						<TextField
							label="Punto de venta ARCA"
							type="number"
							value={formData.punto_venta}
							onChange={(e) => change('punto_venta', e.target.value)}
							error={Boolean(errors.punto_venta)}
							helperText={errors.punto_venta ?? 'Del 1 al 99999'}
							slotProps={{ htmlInput: { min: 1, max: 99999, step: 1 } }}
							required
							disabled={disabled}
						/>
					</Box>
					<TextField
						label="Domicilio fiscal"
						value={formData.domicilio_fiscal}
						onChange={(e) => change('domicilio_fiscal', e.target.value)}
						error={Boolean(errors.domicilio_fiscal)}
						helperText={errors.domicilio_fiscal}
						required
						disabled={disabled}
					/>
					<TextField
						label="Correo electrónico de contacto"
						type="email"
						value={formData.email_contacto}
						onChange={(e) => change('email_contacto', e.target.value)}
						error={Boolean(errors.email_contacto)}
						helperText={errors.email_contacto ?? 'Dirección pública de contacto del club.'}
						required
						disabled={disabled}
					/>
					<Stack
						direction="row"
						spacing={1}
						useFlexGap
						sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}
					>
						{mutation.requiresCheck && (
							<Button
								variant="outlined"
								onClick={() => void mutation.reconcile()}
								disabled={mutation.isPending}
							>
								Verificar resultado
							</Button>
						)}
						<Button
							type="submit"
							variant="contained"
							startIcon={
								mutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined
							}
							disabled={disabled}
						>
							{mutation.isPending ? 'Guardando…' : 'Guardar datos'}
						</Button>
					</Stack>
				</Stack>
			</Box>
		</Paper>
	);
}
