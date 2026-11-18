import {
	Alert,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Stack,
	Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useCategoriasGasto } from '#entities/categoria-gasto';
import {
	formGastoVacio,
	type Gasto,
	GastoFields,
	type GastoForm,
	validarGasto,
} from '#entities/gasto';
import { useAuth } from '#entities/session';
import { useCreateGasto } from '../model/useCreateGasto';
export function CreateGastoDialog({
	hoy,
	onClose,
	onRegistered,
}: {
	hoy: string;
	onClose: () => void;
	onRegistered: (gasto: Gasto, archivo: File | null, evidenciaPrevista: boolean) => void;
}) {
	const { cacheScope, profileStatus } = useAuth();
	const categories = useCategoriasGasto({
		cacheScope,
		enabled: profileStatus === 'ready',
		soloActivas: true,
	});
	const [form, setForm] = useState(() => formGastoVacio(hoy));
	const [errors, setErrors] = useState<Partial<Record<keyof GastoForm, string>>>({});
	const [file, setFile] = useState<File | null>(null);
	const [fileError, setFileError] = useState<string | null>(null);
	const mutation = useCreateGasto((gasto, evidenciaPrevista) =>
		onRegistered(gasto, file, evidenciaPrevista),
	);
	useEffect(() => {
		if (mutation.attempt) {
			const d = mutation.attempt.datos;
			setForm({
				...d,
				monto: String(d.monto),
				referencia_banco: d.referencia_banco ?? '',
				descripcion: d.descripcion ?? '',
			});
		}
	}, [mutation.attempt]);
	const save = () => {
		const result = validarGasto(form);
		setErrors(result.errores);
		if (!result.datos || fileError) {
			return;
		}
		void mutation.submit(result.datos, !!file);
	};
	const disabled = !mutation.enabled || mutation.pending || mutation.requiresCheck;
	return (
		<Dialog
			open
			fullWidth
			maxWidth="md"
			onClose={() => {
				if (!mutation.pending) {
					onClose();
				}
			}}
		>
			<DialogTitle>Registrar gasto</DialogTitle>
			<DialogContent>
				<Stack spacing={2} sx={{ pt: 1 }}>
					{mutation.feedback && <Alert severity="warning">{mutation.feedback}</Alert>}
					{categories.isError && (
						<Alert
							severity="error"
							action={<Button onClick={() => void categories.refetch()}>Reintentar</Button>}
						>
							No pudimos cargar las categorías.
						</Alert>
					)}
					{!categories.isPending && !categories.data?.length && (
						<Alert severity="info">
							Un Administrador debe crear una categoría activa para registrar gastos.
						</Alert>
					)}
					<GastoFields
						form={form}
						onChange={setForm}
						errores={errors}
						disabled={disabled || categories.isPending}
						categorias={categories.data ?? []}
					/>
					<Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
						<Button component="label" variant="outlined" disabled={disabled}>
							Adjuntar evidencia opcional
							<input
								type="file"
								hidden
								accept="image/jpeg,image/png,application/pdf"
								onChange={(event) => {
									const selected = event.target.files?.[0];
									event.target.value = '';
									if (!selected) {
										return;
									}
									if (
										!['image/jpeg', 'image/png', 'application/pdf'].includes(selected.type) ||
										selected.size <= 0 ||
										selected.size > 10 * 1024 * 1024
									) {
										setFileError('Elegí un archivo JPG, PNG o PDF de hasta 10 MB.');
										return;
									}
									setFile(selected);
									setFileError(null);
								}}
							/>
						</Button>
						{file && (
							<>
								<Typography variant="body2">{file.name}</Typography>
								<Button
									disabled={disabled}
									onClick={() => {
										setFile(null);
										setFileError(null);
									}}
								>
									Quitar
								</Button>
							</>
						)}
					</Stack>
					{fileError && (
						<Alert
							severity="error"
							action={
								<Button
									onClick={() => {
										setFileError(null);
										setFile(null);
									}}
								>
									Quitar archivo
								</Button>
							}
						>
							{fileError}
						</Alert>
					)}
					<Typography variant="caption" color="text.secondary">
						La evidencia se guarda después de confirmar el gasto. Si falla la carga, podrás
						recuperarla sobre el mismo registro.
					</Typography>
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button disabled={mutation.pending} onClick={onClose}>
					Cerrar
				</Button>
				{mutation.requiresCheck ? (
					<>
						<Button disabled={mutation.pending} onClick={() => void mutation.check()}>
							Consultar resultado
						</Button>
						{mutation.canResume && (
							<Button variant="contained" disabled={mutation.pending} onClick={mutation.resume}>
								Retomar registro pendiente
							</Button>
						)}
					</>
				) : (
					<Button
						variant="contained"
						disabled={disabled || !categories.data?.length || !!fileError}
						onClick={save}
					>
						{mutation.pending ? 'Guardando…' : 'Guardar gasto'}
					</Button>
				)}
			</DialogActions>
		</Dialog>
	);
}
