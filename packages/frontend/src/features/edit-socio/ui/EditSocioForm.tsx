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
} from '@mui/material';
import { type FormEvent, useId, useState } from 'react';
import { useAuth } from '#entities/session';
import {
	actualizarSocio,
	coincideEdicionSocio,
	formularioDesdeSocio,
	getSocio,
	payloadEdicionSocio,
	type SocioDetalle,
	SocioFields,
	type SocioForm,
	type SocioFormErrors,
	validarSocioForm,
} from '#entities/socio';
import { useVerifiedMutation } from '#shared/lib/useVerifiedMutation';

export function EditSocioForm({
	open,
	socio,
	onClose,
	onSaved,
}: {
	open: boolean;
	socio: SocioDetalle;
	onClose: () => void;
	onSaved: () => void;
}) {
	const { cacheScope, profileStatus, perfil, isSigningOut } = useAuth();
	const titleId = useId();
	const canCorrectDni = perfil?.rol === 'admin';
	const [form, setForm] = useState(() => formularioDesdeSocio(socio));
	const [errors, setErrors] = useState<SocioFormErrors>({});
	const mutation = useVerifiedMutation({
		cacheScope,
		enabled: profileStatus === 'ready' && !isSigningOut,
		queryRoots: ['socios', 'socio', 'socio-deuda'],
		write: (payload: ReturnType<typeof payloadEdicionSocio>, signal) =>
			actualizarSocio(socio.id, payload, signal),
		read: (signal) => getSocio(socio.id, signal),
		matches: coincideEdicionSocio,
		onConfirmed: () => {
			onClose();
			onSaved();
		},
		describeError: (error) =>
			(error as { code?: string } | null)?.code === '23505'
				? 'Ya existe otro socio con ese documento. Revisá el DNI; se conservó la ficha anterior.'
				: 'No se pudieron guardar los cambios. Revisá los datos y los permisos de tu cuenta.',
	});
	const change = (name: keyof SocioForm, value: string | boolean) => {
		mutation.clearFeedback();
		setForm((previous) => ({ ...previous, [name]: value }));
		setErrors((previous) => ({ ...previous, [name]: undefined }));
	};
	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const validation = validarSocioForm(form);
		if (!validation.valid) {
			setErrors(validation.errors);
			return;
		}
		setErrors({});
		void mutation.run(payloadEdicionSocio(validation.payload, canCorrectDni));
	};
	return (
		<Dialog
			open={open}
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
				<DialogTitle id={titleId}>Editar datos del socio</DialogTitle>
				<DialogContent dividers>
					<Stack spacing={3} sx={{ pt: 1 }}>
						{canCorrectDni && (
							<Alert severity="info">
								La matrícula se conserva. Si corregís el DNI, quedarán registrados el valor
								anterior, la fecha y el responsable de la corrección.
							</Alert>
						)}
						{mutation.feedback && <Alert severity="warning">{mutation.feedback}</Alert>}
						<SocioFields
							form={form}
							errors={errors}
							onChange={change}
							disabled={mutation.isPending || mutation.requiresCheck}
							dniEditable={canCorrectDni}
							numeroSocio={socio.numero_socio}
						/>
					</Stack>
				</DialogContent>
				<DialogActions sx={{ flexWrap: 'wrap' }}>
					<Button variant="outlined" onClick={onClose} disabled={mutation.isPending}>
						Cancelar
					</Button>
					{mutation.requiresCheck && (
						<Button onClick={() => void mutation.reconcile()} disabled={mutation.isPending}>
							Consultar resultado
						</Button>
					)}
					<Button
						type="submit"
						variant="contained"
						disabled={!mutation.enabled || mutation.isPending || mutation.requiresCheck}
						startIcon={
							mutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined
						}
					>
						Guardar cambios
					</Button>
				</DialogActions>
			</Box>
		</Dialog>
	);
}
