// src/features/comunicaciones/send-email/ui/SendEmailPanel.tsx

import {
	Alert,
	Box,
	Button,
	Checkbox,
	FormControlLabel,
	MenuItem,
	Stack,
	TextField,
	Typography,
} from '@mui/material';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { RequestIdentity } from '../model/requestIdentity';
import { useAvisoManual, useEmailTemplates } from '../model/useEmail';

interface Props {
	selectedSocios: string[];
	selectedLabels: string[];
	onClearSelection: () => void;
	onPendingChange: (pending: boolean) => void;
	disabled?: boolean;
}
export function SendEmailPanel({
	selectedSocios,
	selectedLabels,
	onClearSelection,
	onPendingChange,
	disabled = false,
}: Props) {
	const mutation = useAvisoManual();
	const templates = useEmailTemplates();
	const [tipo, setTipo] = useState<'general' | 'deuda'>('general');
	const [plantillaId, setPlantillaId] = useState('');
	const [asunto, setAsunto] = useState('');
	const [cuerpo, setCuerpo] = useState('');
	const [incluirDesuscriptos, setIncluirDesuscriptos] = useState(false);
	const [success, setSuccess] = useState('');
	const requestIdentityRef = useRef(new RequestIdentity());
	const locked = mutation.isPending || disabled;
	useEffect(() => {
		onPendingChange(mutation.isPending);
		return () => onPendingChange(false);
	}, [mutation.isPending, onPendingChange]);
	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (locked || selectedSocios.length === 0) {
			return;
		}
		setSuccess('');
		const payload = {
			tipo,
			asunto: tipo === 'deuda' ? 'Aviso de deuda' : asunto.trim(),
			cuerpo:
				tipo === 'deuda' ? 'Información de la deuda pendiente actual del socio.' : cuerpo.trim(),
			sociosIds: [...selectedSocios].sort(),
			plantillaId: tipo === 'general' && plantillaId ? plantillaId : null,
			incluirDesuscriptos: tipo === 'deuda' && incluirDesuscriptos,
		};
		mutation.mutate(
			{ ...payload, requestId: requestIdentityRef.current.forPayload(payload) },
			{
				onSuccess: (result) => {
					setSuccess(
						`${result.encolados} destinatarios aceptados en la cola; ${result.excluidos} excluidos. Referencia: ${result.id}. La entrega aún no está confirmada.`,
					);
					requestIdentityRef.current.reset();
					onClearSelection();
				},
			},
		);
	};
	return (
		<Box
			component="form"
			onSubmit={submit}
			sx={{ mt: 4, pt: 3, borderTop: 1, borderColor: 'divider' }}
		>
			<Stack spacing={2}>
				<Typography variant="h6">Preparar aviso</Typography>
				<Typography>
					{selectedSocios.length} socios seleccionados. Revise los destinatarios antes de confirmar:
				</Typography>
				{selectedLabels.length > 0 && (
					<ul>
						{selectedLabels.map((label) => (
							<li key={label}>{label}</li>
						))}
					</ul>
				)}
				<TextField
					select
					label="Tipo de aviso"
					value={tipo}
					disabled={locked}
					onChange={(e) => {
						setTipo(e.target.value === 'deuda' ? 'deuda' : 'general');
						setIncluirDesuscriptos(false);
						mutation.reset();
					}}
				>
					<MenuItem value="general">Comunicación general</MenuItem>
					<MenuItem value="deuda">Aviso de deuda pendiente</MenuItem>
				</TextField>
				{tipo === 'general' ? (
					<>
						{templates.isError && (
							<Alert
								severity="warning"
								action={<Button onClick={() => void templates.refetch()}>Reintentar</Button>}
							>
								No pudimos cargar las plantillas. Puede redactar el aviso.
							</Alert>
						)}
						<TextField
							select
							label="Plantilla"
							value={plantillaId}
							disabled={locked || templates.isLoading}
							onChange={(e) => {
								const template = templates.data?.find((item) => item.id === e.target.value);
								setPlantillaId(template?.id ?? '');
								if (template) {
									setAsunto(template.asunto);
									setCuerpo(template.cuerpo);
								}
							}}
						>
							<MenuItem value="">Sin plantilla</MenuItem>
							{templates.data?.map((template) => (
								<MenuItem key={template.id} value={template.id}>
									{template.nombre_interno}
								</MenuItem>
							))}
						</TextField>
						<TextField
							label="Asunto"
							required
							value={asunto}
							disabled={locked}
							onChange={(e) => {
								setAsunto(e.target.value);
								setPlantillaId('');
							}}
							slotProps={{ htmlInput: { maxLength: 200 } }}
						/>
						<TextField
							label="Mensaje"
							required
							multiline
							minRows={4}
							value={cuerpo}
							disabled={locked}
							onChange={(e) => {
								setCuerpo(e.target.value);
								setPlantillaId('');
							}}
							helperText="Escriba texto simple. Etiquetas disponibles: {{nombre}}, {{apellido}}, {{deporte}} y {{deuda}}."
						/>
					</>
				) : (
					<>
						<Alert severity="info">
							El servidor redacta un aviso institucional personalizado con la deuda pendiente
							actual. Solo incluye socios que tengan deuda.
						</Alert>
						<TextField
							label="Asunto"
							value="Aviso de deuda"
							slotProps={{ input: { readOnly: true } }}
						/>
						<FormControlLabel
							control={
								<Checkbox
									checked={incluirDesuscriptos}
									disabled={locked}
									onChange={(e) => setIncluirDesuscriptos(e.target.checked)}
								/>
							}
							label="Incluir socios desuscriptos exclusivamente para este aviso de deuda"
						/>
					</>
				)}
				<Typography variant="body2" color="text.secondary">
					Los correos inválidos siempre se excluyen. Los avisos generales se envían a socios
					activos; los avisos de deuda también pueden incluir socios inactivos con deuda pendiente.
					El envío se procesa en segundo plano y su resultado queda en el historial.
				</Typography>
				{mutation.isError && <Alert severity="error">{mutation.error.message}</Alert>}
				{success && <Alert severity="success">{success}</Alert>}
				<Button
					type="submit"
					variant="contained"
					disabled={
						selectedSocios.length === 0 ||
						locked ||
						(tipo === 'general' && (!asunto.trim() || !cuerpo.trim()))
					}
				>
					{mutation.isPending
						? 'Confirmando...'
						: `Confirmar aviso a ${selectedSocios.length} socios seleccionados`}
				</Button>
			</Stack>
		</Box>
	);
}
