import {
	Box,
	Checkbox,
	Chip,
	Divider,
	FormControlLabel,
	Stack,
	TextField,
	Typography,
} from '@mui/material';
import {
	edadSocio,
	fechaBuenosAires,
	type SocioForm,
	type SocioFormErrors,
} from '../model/socioForm';

export interface SocioFieldsProps {
	form: SocioForm;
	errors: SocioFormErrors;
	onChange: (name: keyof SocioForm, value: string | boolean) => void;
	disabled?: boolean;
	dniEditable?: boolean;
	numeroSocio?: number | null;
}

export function SocioFields({
	form,
	errors,
	onChange,
	disabled = false,
	dniEditable = true,
	numeroSocio,
}: SocioFieldsProps) {
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
			onChange={(event) => onChange(name, event.target.value)}
			error={Boolean(errors[name])}
			helperText={errors[name]}
			required={required}
			disabled={disabled || (name === 'dni' && !dniEditable)}
			fullWidth
			slotProps={{ htmlInput: maximum ? { maxLength: maximum } : {} }}
		/>
	);
	const grid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 };
	return (
		<Stack spacing={3}>
			<Box component="section" aria-label="Datos personales">
				<Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 700 }}>
					Datos personales
				</Typography>
				<Box sx={grid}>
					{field('dni', 'DNI / Documento', 20, true)}
					<TextField
						label="N.º de socio (matrícula)"
						value={numeroSocio ?? 'Se asigna al guardar'}
						disabled
						fullWidth
					/>
					{field('nombre', 'Nombre', 100, true)}
					{field('apellido', 'Apellido', 100, true)}
					<TextField
						label="Fecha de nacimiento"
						type="date"
						value={form.fecha_nacimiento}
						onChange={(event) => onChange('fecha_nacimiento', event.target.value)}
						required
						fullWidth
						disabled={disabled}
						error={Boolean(errors.fecha_nacimiento)}
						helperText={errors.fecha_nacimiento}
						slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: fechaBuenosAires() } }}
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
				{!dniEditable && (
					<Typography variant="caption" color="text.secondary">
						La corrección del documento requiere un Administrador.
					</Typography>
				)}
			</Box>
			<Divider />
			<Box component="section" aria-label="Información de contacto y preferencias">
				<Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 700 }}>
					Información de contacto y preferencias
				</Typography>
				<Box sx={grid}>
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
							onChange={(event) => onChange('acepta_comunicaciones', event.target.checked)}
							disabled={disabled}
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
					border: 1,
					borderColor: minor ? 'primary.main' : 'divider',
					borderRadius: 2,
					bgcolor: 'action.hover',
				}}
			>
				<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
					Contacto de emergencia
				</Typography>
				<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
					{minor ? 'Obligatorio para menores de 18 años.' : 'Opcional para mayores de edad.'}
				</Typography>
				<Box sx={grid}>
					{field('contacto_emergencia_nombre', 'Nombre del contacto de emergencia', 150, minor)}
					{field('contacto_emergencia_telefono', 'Teléfono del contacto de emergencia', 50, minor)}
				</Box>
			</Box>
		</Stack>
	);
}
