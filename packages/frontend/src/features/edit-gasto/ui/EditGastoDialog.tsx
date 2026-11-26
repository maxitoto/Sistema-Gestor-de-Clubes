import {
	Alert,
	Button,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Stack,
} from '@mui/material';
import { useState } from 'react';
import { useCategoriasGasto } from '#entities/categoria-gasto';
import {
	actualizarGasto,
	coincideGasto,
	type DatosGasto,
	errorGasto,
	formDesdeGasto,
	type Gasto,
	GastoFields,
	type GastoForm,
	getGasto,
	validarGasto,
} from '#entities/gasto';
import { useAuth } from '#entities/session';
import { useVerifiedMutation } from '#shared/lib/useVerifiedMutation';

export function EditGastoDialog({
	gasto,
	onClose,
	onSaved,
}: {
	gasto: Gasto;
	onClose: () => void;
	onSaved: (g: Gasto) => void;
}) {
	const { cacheScope, profileStatus, perfil } = useAuth();
	const categories = useCategoriasGasto({
		cacheScope,
		enabled: profileStatus === 'ready',
		soloActivas: true,
	});
	const [form, setForm] = useState(() => formDesdeGasto(gasto));
	const [errors, setErrors] = useState<Partial<Record<keyof GastoForm, string>>>({});
	const mutation = useVerifiedMutation<DatosGasto, Gasto>({
		cacheScope,
		enabled: profileStatus === 'ready',
		queryRoots: ['gastos', 'gasto', 'caja', 'movimientos-caja'],
		write: (datos, signal) => actualizarGasto(gasto.id, datos, perfil?.id ?? '', signal),
		read: (signal) => getGasto(gasto.id, signal),
		matches: coincideGasto,
		onConfirmed: onSaved,
		describeError: errorGasto,
	});
	const categoryList = [...(categories.data ?? [])];
	if (gasto.categoria && !categoryList.some((c) => c.id === gasto.categoria_id)) {
		categoryList.push({ ...gasto.categoria, descripcion: null });
	}
	const save = () => {
		const result = validarGasto(form);
		setErrors(result.errores);
		if (result.datos) {
			void mutation.run(result.datos);
		}
	};

	return (
		<Dialog
			open
			fullWidth
			maxWidth="md"
			aria-labelledby="edit-gasto-title"
			onClose={() => {
				if (!mutation.isPending) {
					onClose();
				}
			}}
		>
			<DialogTitle id="edit-gasto-title">Editar gasto</DialogTitle>
			<DialogContent dividers>
				<Stack spacing={2.5}>
					<Alert severity="info">
						Podés editar un gasto activo durante su día de carga. Cambiar la fecha del gasto no
						extiende ese plazo.
					</Alert>
					{mutation.feedback && <Alert severity="warning">{mutation.feedback}</Alert>}
					<GastoFields
						form={form}
						onChange={(next) => {
							setForm(next);
							if (Object.keys(errors).length) {
								setErrors({});
							}
						}}
						errores={errors}
						disabled={mutation.isPending || mutation.requiresCheck || !mutation.enabled}
						categorias={categoryList}
					/>
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button disabled={mutation.isPending} onClick={onClose}>
					Cancelar
				</Button>
				{mutation.requiresCheck ? (
					<Button disabled={mutation.isPending} onClick={() => void mutation.reconcile()}>
						Consultar resultado
					</Button>
				) : (
					<Button
						variant="contained"
						startIcon={
							mutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined
						}
						disabled={mutation.isPending || !mutation.enabled}
						onClick={save}
					>
						{mutation.isPending ? 'Guardando…' : 'Guardar cambios'}
					</Button>
				)}
			</DialogActions>
		</Dialog>
	);
}
