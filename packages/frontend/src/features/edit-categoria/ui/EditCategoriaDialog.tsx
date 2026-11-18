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
	actualizarCategoria,
	type Categoria,
	type CategoriaForm,
	type CategoriaFormErrors,
	type CategoriaSuperpuesta,
	type CrearCategoriaPayload,
	consultarSuperposicion,
	describirErrorCategoria,
	getCategoria,
	validarCategoriaForm,
} from '#entities/categoria';
import { useAuth } from '#entities/session';
import { useVerifiedMutation } from '#shared/lib/useVerifiedMutation';

export function EditCategoriaDialog({
	categoria,
	deporteNombre,
	onClose,
	onSaved,
}: {
	categoria: Categoria;
	deporteNombre: string;
	onClose: () => void;
	onSaved: (row: Categoria) => void;
}) {
	const titleId = useId();
	const { cacheScope, profileStatus, perfil, isSigningOut } = useAuth();
	const enabled =
		profileStatus === 'ready' &&
		perfil?.rol === 'admin' &&
		perfil.estado === 'activo' &&
		!isSigningOut;
	const [form, setForm] = useState<CategoriaForm>({
		deporte_id: categoria.deporte_id,
		nombre: categoria.nombre,
		arancel_mensual: String(categoria.arancel_mensual),
		edad_min: categoria.edad_min === null ? '' : String(categoria.edad_min),
		edad_max: categoria.edad_max === null ? '' : String(categoria.edad_max),
	});
	const [errors, setErrors] = useState<CategoriaFormErrors>({});
	const [overlap, setOverlap] = useState<{
		payload: CrearCategoriaPayload;
		rows: CategoriaSuperpuesta[];
	} | null>(null);
	const [checking, setChecking] = useState(false);
	const [checkError, setCheckError] = useState<string | null>(null);
	const sequenceRef = useRef(0);
	const requestRef = useRef<AbortController | null>(null);
	const accessRef = useRef<string | null>(null);
	accessRef.current = enabled ? cacheScope : null;
	const lockedRef = useRef(false);
	useEffect(() => {
		const scope = cacheScope;
		return () => {
			sequenceRef.current++;
			requestRef.current?.abort();
			if (accessRef.current === scope) {
				accessRef.current = null;
			}
		};
	}, [cacheScope]);
	const mutation = useVerifiedMutation<CrearCategoriaPayload, Categoria>({
		cacheScope,
		enabled,
		queryRoots: ['categorias', 'inscripciones'],
		write: (payload, signal) => actualizarCategoria(categoria.id, payload, signal),
		read: (signal) => getCategoria(categoria.id, signal),
		matches: (row, payload) =>
			row.deporte_id === payload.deporte_id &&
			row.nombre === payload.nombre &&
			row.arancel_mensual === payload.arancel_mensual &&
			row.edad_min === payload.edad_min &&
			row.edad_max === payload.edad_max,
		onConfirmed: onSaved,
		describeError: describirErrorCategoria,
	});
	const busy = checking || mutation.isPending;
	const disabled = busy || mutation.requiresCheck;
	const change = (key: Exclude<keyof CategoriaForm, 'deporte_id'>, value: string) => {
		sequenceRef.current++;
		requestRef.current?.abort();
		lockedRef.current = false;
		setChecking(false);
		setForm((previous) => ({ ...previous, [key]: value }));
		setErrors({});
		setOverlap(null);
		setCheckError(null);
		mutation.clearFeedback();
	};
	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!accessRef.current || lockedRef.current || mutation.isPending || mutation.requiresCheck) {
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
		lockedRef.current = true;
		setChecking(true);
		const version = ++sequenceRef.current;
		const scope = accessRef.current;
		const controller = new AbortController();
		requestRef.current = controller;
		try {
			const rows = await consultarSuperposicion(result.payload, controller.signal, categoria.id);
			if (sequenceRef.current !== version || accessRef.current !== scope) {
				return;
			}
			if (rows.length) {
				setOverlap({ payload: result.payload, rows });
			} else {
				await mutation.run(result.payload);
			}
		} catch {
			if (sequenceRef.current === version && accessRef.current === scope) {
				setCheckError(
					'No pudimos consultar los rangos actuales. Reintentá la consulta; los cambios todavía no se enviaron.',
				);
			}
		} finally {
			if (sequenceRef.current === version && accessRef.current === scope) {
				lockedRef.current = false;
				setChecking(false);
			}
		}
	};
	const field = (
		key: Exclude<keyof CategoriaForm, 'deporte_id'>,
		label: string,
		required = false,
	) => (
		<TextField
			key={key}
			label={label}
			required={required}
			disabled={disabled}
			value={form[key]}
			onChange={(event) => change(key, event.target.value)}
			error={Boolean(errors[key])}
			helperText={errors[key]}
			slotProps={{
				htmlInput:
					key === 'nombre'
						? { maxLength: 100 }
						: { inputMode: key === 'arancel_mensual' ? 'decimal' : 'numeric' },
			}}
		/>
	);
	return (
		<Dialog
			open
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
				<DialogTitle id={titleId}>Editar categoría</DialogTitle>
				<DialogContent>
					<Stack spacing={2.5} sx={{ pt: 1 }}>
						<Typography variant="body2" color="text.secondary">
							Deporte: {deporteNombre}. El nuevo arancel sólo afecta cuotas que se generen después
							del cambio.
						</Typography>
						{mutation.feedback && (
							<Alert severity={mutation.requiresCheck ? 'warning' : 'error'}>
								{mutation.feedback}
							</Alert>
						)}
						{mutation.requiresCheck && (
							<Button disabled={busy} onClick={() => void mutation.reconcile()}>
								Consultar resultado guardado
							</Button>
						)}
						{checkError && <Alert severity="error">{checkError}</Alert>}
						{field('nombre', 'Nombre de la categoría', true)}
						{field('arancel_mensual', 'Arancel mensual ($)', true)}
						<Typography variant="caption" color="text.secondary">
							Importe mayor a cero, con punto decimal. Las cuotas emitidas conservan su importe.
							Dejá ambas edades vacías si no hay límite.
						</Typography>
						<Box
							sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}
						>
							{field('edad_min', 'Edad mínima (opcional)')}
							{field('edad_max', 'Edad máxima (opcional)')}
						</Box>
						{overlap && (
							<Alert severity="warning">
								El rango se superpone con: {overlap.rows.map((row) => row.nombre).join(', ')}. Podés
								confirmar los cambios si corresponde.
								<Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
									<Button disabled={busy} onClick={() => setOverlap(null)}>
										Revisar rango
									</Button>
									<Button
										variant="contained"
										color="warning"
										disabled={disabled || !enabled}
										onClick={() => {
											const payload = overlap.payload;
											setOverlap(null);
											void mutation.run(payload);
										}}
									>
										Confirmar y guardar cambios
									</Button>
								</Box>
							</Alert>
						)}
					</Stack>
				</DialogContent>
				<DialogActions sx={{ borderTop: 1, borderColor: 'divider' }}>
					<Button variant="outlined" color="inherit" disabled={busy} onClick={onClose}>
						Cancelar
					</Button>
					<Button
						type="submit"
						variant="contained"
						disabled={disabled || !enabled || Boolean(overlap)}
					>
						{busy ? 'Verificando…' : 'Guardar cambios'}
					</Button>
				</DialogActions>
			</Box>
		</Dialog>
	);
}
