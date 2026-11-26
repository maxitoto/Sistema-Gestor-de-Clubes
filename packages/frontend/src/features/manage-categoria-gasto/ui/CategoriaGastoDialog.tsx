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
	TextField,
	Typography,
} from '@mui/material';
import { type FormEvent, useState } from 'react';
import {
	actualizarCategoriaGasto,
	buscarCategoriaGasto,
	type CategoriaGasto,
	type CategoriaGastoPayload,
	crearCategoriaGasto,
	describirErrorCategoriaGasto,
	getCategoriaGasto,
	validarCategoriaGasto,
} from '#entities/categoria-gasto';
import { useAuth } from '#entities/session';
import { useHumanCreate } from '#shared/lib/useHumanCreate';
import { useVerifiedMutation } from '#shared/lib/useVerifiedMutation';

export function CategoriaGastoDialog({
	categoria,
	onClose,
	onSaved,
}: {
	categoria: CategoriaGasto | null;
	onClose: () => void;
	onSaved: () => void;
}) {
	const { cacheScope, perfil, profileStatus, isSigningOut } = useAuth();
	const enabled = profileStatus === 'ready' && perfil?.rol === 'admin' && !isSigningOut;
	const [form, setForm] = useState({
		nombre: categoria?.nombre ?? '',
		descripcion: categoria?.descripcion ?? '',
	});
	const [fieldError, setFieldError] = useState<string | null>(null);
	const create = useHumanCreate<CategoriaGastoPayload, CategoriaGasto>({
		cacheScope,
		enabled: enabled && !categoria,
		queryRoot: 'categorias-gasto',
		create: (payload, signal) => crearCategoriaGasto(payload, perfil?.id ?? '', signal),
		lookup: buscarCategoriaGasto,
		onCreated: onSaved,
		messages: {
			duplicate: 'Ya existe una categoría de gasto con ese nombre, incluso si está inactiva.',
			validation:
				'El servidor rechazó los datos. Revisá el nombre y la descripción de la categoría.',
		},
	});
	const edit = useVerifiedMutation<CategoriaGastoPayload, CategoriaGasto>({
		cacheScope,
		enabled: enabled && !!categoria,
		queryRoots: ['categorias-gasto', 'gastos', 'caja'],
		write: (payload, signal) =>
			actualizarCategoriaGasto(categoria?.id ?? '', payload, perfil?.id ?? '', signal),
		read: (signal) => getCategoriaGasto(categoria?.id ?? '', signal),
		matches: (row, payload) =>
			row.nombre === payload.nombre && row.descripcion === payload.descripcion,
		onConfirmed: onSaved,
		describeError: describirErrorCategoriaGasto,
	});
	const pending = categoria ? edit.isPending : create.isPending;
	const requiresCheck = categoria ? edit.requiresCheck : create.requiresCheck;

	const submit = (event: FormEvent) => {
		event.preventDefault();
		const result = validarCategoriaGasto(form);
		if (!result.valid) {
			setFieldError(result.error);
			return;
		}
		setFieldError(null);
		if (categoria) {
			void edit.run(result.payload);
		} else {
			void create.create(result.payload);
		}
	};

	return (
		<Dialog
			open
			maxWidth="sm"
			fullWidth
			aria-labelledby="categoria-gasto-title"
			onClose={() => {
				if (!pending) {
					onClose();
				}
			}}
		>
			<Box component="form" onSubmit={submit} noValidate>
				<DialogTitle id="categoria-gasto-title">
					{categoria ? 'Editar categoría de gasto' : 'Nueva categoría de gasto'}
				</DialogTitle>
				<DialogContent dividers>
					<Stack spacing={2.25}>
						<Typography variant="body2" color="text.secondary">
							La clasificación se conserva en los gastos anteriores. Renombrar la categoría
							actualiza cómo se muestra en el historial.
						</Typography>
						{fieldError && <Alert severity="error">{fieldError}</Alert>}
						{categoria
							? edit.feedback && (
									<Alert severity={requiresCheck ? 'warning' : 'error'}>{edit.feedback}</Alert>
								)
							: create.feedback && (
									<Alert severity={requiresCheck ? 'warning' : 'error'}>
										{create.feedback.message}
									</Alert>
								)}
						<TextField
							label="Nombre"
							placeholder="Ej. Servicios, Mantenimiento, Equipamiento"
							value={form.nombre}
							required
							disabled={pending || requiresCheck}
							slotProps={{ htmlInput: { maxLength: 100 } }}
							onChange={(e) => {
								setForm({ ...form, nombre: e.target.value });
								setFieldError(null);
							}}
						/>
						<TextField
							label="Descripción (opcional)"
							value={form.descripcion}
							multiline
							minRows={2}
							disabled={pending || requiresCheck}
							onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
						/>
						{requiresCheck && (
							<Button
								variant="outlined"
								size="small"
								disabled={pending}
								onClick={() => void (categoria ? edit.reconcile() : create.checkExisting())}
								sx={{ alignSelf: 'flex-start' }}
							>
								Consultar resultado
							</Button>
						)}
					</Stack>
				</DialogContent>
				<DialogActions>
					<Button disabled={pending} onClick={onClose}>
						Cancelar
					</Button>
					<Button
						type="submit"
						variant="contained"
						startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}
						disabled={!enabled || pending || requiresCheck}
					>
						{pending ? 'Guardando…' : 'Guardar categoría'}
					</Button>
				</DialogActions>
			</Box>
		</Dialog>
	);
}
