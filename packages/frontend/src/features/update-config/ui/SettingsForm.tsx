import { Alert, Box, Button, Paper, TextField, Typography } from '@mui/material';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ClubConfig } from '#shared/types';
import { type ClubForm, toClubForm, toClubUpdate } from '../model/clubForm';
import { useUpdateClubConfig } from '../model/useUpdateClubConfig';

export function SettingsForm({ initialData }: { initialData: ClubConfig }) {
	const navigate = useNavigate();
	const mutation = useUpdateClubConfig();
	const [formData, setFormData] = useState(() => toClubForm(initialData));
	const [validationError, setValidationError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
	const change = (name: keyof ClubForm, value: string) => {
		setFormData((previous) => ({ ...previous, [name]: value }));
		setSaved(false);
		setValidationError(null);
	};
	const save = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setValidationError(null);
		setSaved(false);
		try {
			const payload = toClubUpdate(formData);
			mutation.mutate({ id: initialData.id, payload }, { onSuccess: () => setSaved(true) });
		} catch (error) {
			setValidationError(error instanceof Error ? error.message : 'Revise los datos ingresados.');
		}
	};
	return (
		<Paper sx={{ p: { xs: 2, sm: 4 }, maxWidth: 600, mx: 'auto', mt: 4 }}>
			<Typography variant="h4" component="h1" gutterBottom>
				Configuración del Club
			</Typography>
			{validationError && (
				<Alert severity="warning" sx={{ mb: 2 }}>
					{validationError}
				</Alert>
			)}
			{mutation.isError && (
				<Alert severity="error" sx={{ mb: 2 }}>
					No pudimos guardar la configuración. Revise su conexión y vuelva a intentarlo.
				</Alert>
			)}
			{saved && (
				<Alert severity="success" sx={{ mb: 2 }}>
					Configuración guardada.
				</Alert>
			)}
			<Box
				component="form"
				onSubmit={save}
				sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}
			>
				<TextField
					label="Nombre / Razón Social"
					value={formData.nombre}
					onChange={(e) => change('nombre', e.target.value)}
					required
					disabled={mutation.isPending}
				/>
				<TextField
					label="CUIT"
					value={formData.cuit}
					onChange={(e) => change('cuit', e.target.value)}
					required
					disabled={mutation.isPending}
				/>
				<TextField
					label="Domicilio Fiscal"
					value={formData.domicilio_fiscal}
					onChange={(e) => change('domicilio_fiscal', e.target.value)}
					required
					disabled={mutation.isPending}
				/>
				<TextField
					label="Email de Contacto"
					type="email"
					value={formData.email_contacto}
					onChange={(e) => change('email_contacto', e.target.value)}
					required
					disabled={mutation.isPending}
				/>
				<TextField
					label="Punto de Venta"
					type="number"
					value={formData.punto_venta}
					onChange={(e) => change('punto_venta', e.target.value)}
					slotProps={{ htmlInput: { min: 1, max: 99999, step: 1 } }}
					required
					disabled={mutation.isPending}
				/>
				<TextField
					label="URL del Logo (Opcional)"
					type="url"
					value={formData.logo_url}
					onChange={(e) => change('logo_url', e.target.value)}
					disabled={mutation.isPending}
				/>
				<Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
					<Button onClick={() => navigate(-1)} disabled={mutation.isPending}>
						Volver
					</Button>
					<Button type="submit" variant="contained" disabled={mutation.isPending}>
						{mutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
					</Button>
				</Box>
			</Box>
		</Paper>
	);
}
