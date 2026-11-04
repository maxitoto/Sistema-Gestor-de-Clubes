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
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import {
	type Categoria,
	type CategoriaSuperpuesta,
	type CrearCategoriaPayload,
	consultarSuperposicion,
} from '#entities/categoria';
import { useAuth } from '#entities/session';
import {
	type CategoriaForm,
	type CategoriaFormErrors,
	validarCategoriaForm,
} from '../model/categoriaForm';
import { useCreateCategoria } from '../model/useCreateCategoria';
export function CreateCategoriaDialog({
	deporteId,
	deporteNombre,
	open,
	onClose,
	onCreated,
}: {
	deporteId: string;
	deporteNombre: string;
	open: boolean;
	onClose: () => void;
	onCreated: (categoria: Categoria) => void;
}) {
	const titleId = useId();
	const { cacheScope, profileStatus, perfil, isSigningOut } = useAuth();
	const [form, setForm] = useState<CategoriaForm>({
		deporte_id: deporteId,
		nombre: '',
		arancel_mensual: '',
		edad_min: '',
		edad_max: '',
	});
	const [errors, setErrors] = useState<CategoriaFormErrors>({});
	const [overlap, setOverlap] = useState<{
		payload: CrearCategoriaPayload;
		rows: CategoriaSuperpuesta[];
	} | null>(null);
	const [checking, setChecking] = useState(false);
	const [checkError, setCheckError] = useState<string | null>(null);
	const versionRef = useRef(0);
	const requestRef = useRef<AbortController | null>(null);
	const checkingRef = useRef(false);
	const accessRef = useRef<string | null>(null);
	accessRef.current =
		profileStatus === 'ready' &&
		perfil?.rol === 'admin' &&
		perfil.estado === 'activo' &&
		!isSigningOut
			? cacheScope
			: null;
	const mutation = useCreateCategoria((created) => {
		onCreated(created);
		onClose();
	});
	useEffect(() => {
		const scope = cacheScope;
		return () => {
			versionRef.current++;
			requestRef.current?.abort();
			if (accessRef.current === scope) {
				accessRef.current = null;
			}
		};
	}, [cacheScope]);
	const change = (name: keyof CategoriaForm, value: string) => {
		versionRef.current++;
		requestRef.current?.abort();
		checkingRef.current = false;
		setChecking(false);
		setForm((previous) => ({ ...previous, [name]: value }));
		setErrors({});
		setOverlap(null);
		setCheckError(null);
	};
	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (checkingRef.current || mutation.isPending || !accessRef.current || mutation.requiresCheck) {
			return;
		}
		const result = validarCategoriaForm(form);
		if (!result.valid) {
			setErrors(result.errors);
			return;
		}
		setErrors({});
		setCheckError(null);
		setOverlap(null);
		checkingRef.current = true;
		setChecking(true);
		const scope = accessRef.current;
		const attempt = ++versionRef.current;
		const controller = new AbortController();
		requestRef.current = controller;
		try {
			const rows = await consultarSuperposicion(result.payload, controller.signal);
			if (versionRef.current !== attempt || accessRef.current !== scope) {
				return;
			}
			if (rows.length) {
				setOverlap({ payload: result.payload, rows });
			} else {
				await mutation.create(result.payload);
			}
		} catch {
			if (versionRef.current === attempt && accessRef.current === scope) {
				setCheckError(
					'No pudimos consultar los rangos existentes. Reintentá la consulta; todavía no se envió el alta.',
				);
			}
		} finally {
			if (versionRef.current === attempt && accessRef.current === scope) {
				checkingRef.current = false;
				setChecking(false);
			}
		}
	};
	const busy = mutation.isPending || checking;
	const field = (
		name: Exclude<keyof CategoriaForm, 'deporte_id'>,
		label: string,
		required = false,
	) => (
		<TextField
			key={name}
			label={label}
			required={required}
			value={form[name]}
			onChange={(event) => change(name, event.target.value)}
			disabled={busy}
			error={Boolean(errors[name])}
			helperText={errors[name]}
			slotProps={{
				htmlInput:
					name === 'nombre'
						? { maxLength: 100 }
						: { inputMode: name === 'arancel_mensual' ? 'decimal' : 'numeric' },
			}}
		/>
	);
	return (
		<Dialog
			open={open}
			fullWidth
			maxWidth="sm"
			aria-labelledby={titleId}
			onClose={() => {
				if (!busy) {
					onClose();
				}
			}}
		>
			<Box component="form" noValidate onSubmit={(event) => void submit(event)}>
				<DialogTitle id={titleId} sx={{ px: 3, pt: 3, pb: 2 }}>
					Nueva categoría
				</DialogTitle>
				<DialogContent sx={{ px: 3 }}>
					<Stack spacing={2.5} sx={{ pt: 1 }}>
						<Typography variant="body2" color="text.secondary">
							Definí una categoría para{' '}
							<Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
								{deporteNombre}
							</Box>
							.
						</Typography>
						{mutation.feedback && <Alert severity="warning">{mutation.feedback.message}</Alert>}
						{mutation.feedback?.existing && (
							<Alert severity="info">
								Ya existe la categoría {mutation.feedback.existing.nombre}. Revisá el registro antes
								de iniciar otra alta.
							</Alert>
						)}
						{mutation.requiresCheck && (
							<Button disabled={busy} onClick={() => void mutation.checkExisting()}>
								Consultar resultado del alta
							</Button>
						)}
						{checkError && <Alert severity="error">{checkError}</Alert>}
						{field('nombre', 'Nombre de la categoría', true)}
						{field('arancel_mensual', 'Arancel mensual ($)', true)}
						<Typography variant="caption" color="text.secondary">
							Ingresá un importe mayor a cero, con punto decimal. Dejá ambas edades vacías si no hay
							límite de edad.
						</Typography>
						<Box
							sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}
						>
							{field('edad_min', 'Edad mínima (opcional)')}
							{field('edad_max', 'Edad máxima (opcional)')}
						</Box>
						{overlap && (
							<Alert severity="warning">
								El rango se superpone con: {overlap.rows.map((row) => row.nombre).join(', ')}. Es
								una advertencia; podés confirmar el alta si corresponde.
								<Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
									<Button disabled={busy} onClick={() => setOverlap(null)}>
										Revisar rango
									</Button>
									<Button
										variant="contained"
										color="warning"
										disabled={busy || !mutation.enabled || mutation.requiresCheck}
										onClick={() => {
											const payload = overlap.payload;
											setOverlap(null);
											void mutation.create(payload);
										}}
									>
										Confirmar y crear categoría
									</Button>
								</Box>
							</Alert>
						)}
					</Stack>
				</DialogContent>
				<DialogActions
					sx={{ px: 3, py: 2.5, borderTop: 1, borderColor: 'divider', gap: 1, flexWrap: 'wrap' }}
				>
					{mutation.feedback?.existing && (
						<Button
							disabled={busy}
							onClick={() => {
								mutation.resetForNew();
								setForm({
									deporte_id: deporteId,
									nombre: '',
									arancel_mensual: '',
									edad_min: '',
									edad_max: '',
								});
								setOverlap(null);
								setErrors({});
							}}
						>
							Iniciar otra alta
						</Button>
					)}
					<Button variant="outlined" color="inherit" disabled={busy} onClick={onClose}>
						Cancelar
					</Button>
					<Button
						type="submit"
						variant="contained"
						disabled={busy || !mutation.enabled || mutation.requiresCheck || Boolean(overlap)}
					>
						{busy ? 'Procesando…' : 'Guardar categoría'}
					</Button>
				</DialogActions>
			</Box>
		</Dialog>
	);
}
