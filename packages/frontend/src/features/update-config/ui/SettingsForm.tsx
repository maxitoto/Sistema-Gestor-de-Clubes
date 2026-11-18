import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { type FormEvent, useState } from 'react';
import type { ClubConfig } from '#shared/types';
import { type ClubForm, toClubForm, toClubUpdate } from '../model/clubForm';
import { useUpdateClubConfig } from '../model/useUpdateClubConfig';

export function SettingsForm({ initialData }: { initialData: ClubConfig }) {
	const [formData, setFormData] = useState(() => toClubForm(initialData));
	const [validationError, setValidationError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
	const mutation = useUpdateClubConfig(() => setSaved(true));
	const change = (name: keyof ClubForm, value: string) => {
		setFormData((previous) => ({ ...previous, [name]: value }));
		setSaved(false);
		setValidationError(null);
	};
	const save = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setSaved(false);
		setValidationError(null);
		try {
			void mutation.run({ id: initialData.id, payload: toClubUpdate(formData) });
		} catch (error) {
			setValidationError(error instanceof Error ? error.message : 'Revise los datos ingresados.');
		}
	};
	const disabled = mutation.isPending || mutation.requiresCheck;
	return (
		<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
			<Typography variant="h6" component="h2" sx={{ mb: 2 }}>
				Datos institucionales
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
				El email de contacto es la dirección pública del club.
			</Typography>
			{validationError && (
				<Alert severity="warning" sx={{ mb: 2 }}>
					{validationError}
				</Alert>
			)}
			{mutation.feedback && (
				<Alert severity="warning" sx={{ mb: 2 }}>
					{mutation.feedback}
				</Alert>
			)}
			{saved && (
				<Alert severity="success" sx={{ mb: 2 }}>
					Configuración guardada.
				</Alert>
			)}
			<Box component="form" onSubmit={save}>
				<Stack spacing={2.5}>
					<TextField
						label="Nombre / Razón social"
						value={formData.nombre}
						onChange={(e) => change('nombre', e.target.value)}
						required
						disabled={disabled}
					/>
					<TextField
						label="CUIT"
						helperText="Formato: XX-XXXXXXXX-X"
						value={formData.cuit}
						onChange={(e) => change('cuit', e.target.value)}
						required
						disabled={disabled}
					/>
					<TextField
						label="Domicilio fiscal"
						value={formData.domicilio_fiscal}
						onChange={(e) => change('domicilio_fiscal', e.target.value)}
						required
						disabled={disabled}
					/>
					<TextField
						label="Email de contacto"
						type="email"
						value={formData.email_contacto}
						onChange={(e) => change('email_contacto', e.target.value)}
						required
						disabled={disabled}
					/>
					<TextField
						label="Punto de venta"
						type="number"
						value={formData.punto_venta}
						onChange={(e) => change('punto_venta', e.target.value)}
						slotProps={{ htmlInput: { min: 1, max: 99999, step: 1 } }}
						required
						disabled={disabled}
					/>
					<Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
						{mutation.requiresCheck && (
							<Button onClick={() => void mutation.reconcile()} disabled={mutation.isPending}>
								Verificar resultado
							</Button>
						)}
						<Button type="submit" variant="contained" disabled={disabled}>
							{mutation.isPending ? 'Guardando…' : 'Guardar datos'}
						</Button>
					</Stack>
				</Stack>
			</Box>
		</Paper>
	);
}
