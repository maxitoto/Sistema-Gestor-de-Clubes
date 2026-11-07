import {
	Alert,
	Button,
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
			onClose={() => {
				if (!mutation.isPending) {
					onClose();
				}
			}}
		>
			<DialogTitle>Editar gasto</DialogTitle>
			<DialogContent>
				<Stack spacing={2} sx={{ pt: 1 }}>
					<Alert severity="info">
						Podés corregir un gasto activo durante su día de carga. La fecha del gasto no amplía ese
						permiso.
					</Alert>
					{mutation.feedback && <Alert severity="warning">{mutation.feedback}</Alert>}
					<GastoFields
						form={form}
						onChange={setForm}
						errores={errors}
						disabled={mutation.isPending || mutation.requiresCheck || !mutation.enabled}
						categorias={categoryList}
					/>
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button disabled={mutation.isPending} onClick={onClose}>
					Cerrar
				</Button>
				{mutation.requiresCheck ? (
					<Button disabled={mutation.isPending} onClick={() => void mutation.reconcile()}>
						Consultar resultado
					</Button>
				) : (
					<Button
						variant="contained"
						disabled={mutation.isPending || !mutation.enabled}
						onClick={save}
					>
						Guardar cambios
					</Button>
				)}
			</DialogActions>
		</Dialog>
	);
}
