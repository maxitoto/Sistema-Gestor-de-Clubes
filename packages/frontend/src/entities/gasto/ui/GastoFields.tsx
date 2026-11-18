import { MenuItem, Stack, TextField } from '@mui/material';
import type { GastoForm } from '../model/gastoForm';
export function GastoFields({
	form,
	onChange,
	errores,
	disabled,
	categorias,
}: {
	form: GastoForm;
	onChange: (form: GastoForm) => void;
	errores: Partial<Record<keyof GastoForm, string>>;
	disabled: boolean;
	categorias: { id: string; nombre: string; estado: string }[];
}) {
	return (
		<Stack spacing={2}>
			<Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
				<TextField
					label="Fecha del gasto"
					type="date"
					required
					value={form.fecha}
					onChange={(e) => onChange({ ...form, fecha: e.target.value })}
					error={!!errores.fecha}
					helperText={errores.fecha}
					disabled={disabled}
					slotProps={{ inputLabel: { shrink: true } }}
					sx={{ flex: 1 }}
				/>
				<TextField
					label="Categoría"
					required
					select
					value={form.categoria_id}
					onChange={(e) => onChange({ ...form, categoria_id: e.target.value })}
					disabled={disabled}
					error={!!errores.categoria_id}
					helperText={errores.categoria_id}
					sx={{ flex: 1 }}
				>
					{categorias.map((c) => (
						<MenuItem key={c.id} value={c.id}>
							{c.nombre}
							{c.estado === 'inactivo' ? ' (inactiva)' : ''}
						</MenuItem>
					))}
				</TextField>
				<TextField
					label="Importe"
					required
					value={form.monto}
					onChange={(e) => onChange({ ...form, monto: e.target.value })}
					disabled={disabled}
					error={!!errores.monto}
					helperText={errores.monto}
					slotProps={{ htmlInput: { inputMode: 'decimal' } }}
					sx={{ flex: 1 }}
				/>
			</Stack>
			<TextField
				label="Concepto"
				required
				value={form.concepto}
				onChange={(e) => onChange({ ...form, concepto: e.target.value })}
				disabled={disabled}
				error={!!errores.concepto}
				helperText={errores.concepto}
				slotProps={{ htmlInput: { maxLength: 255 } }}
			/>
			<Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
				<TextField
					label="Medio de pago"
					required
					select
					value={form.metodo_pago}
					onChange={(e) =>
						onChange({ ...form, metodo_pago: e.target.value as GastoForm['metodo_pago'] })
					}
					disabled={disabled}
					sx={{ flex: 1 }}
				>
					<MenuItem value="efectivo">Efectivo</MenuItem>
					<MenuItem value="transferencia">Transferencia bancaria</MenuItem>
				</TextField>
				<TextField
					label="Referencia / Banco"
					required={form.metodo_pago === 'transferencia'}
					value={form.referencia_banco}
					onChange={(e) => onChange({ ...form, referencia_banco: e.target.value })}
					disabled={disabled}
					error={!!errores.referencia_banco}
					helperText={
						errores.referencia_banco ??
						(form.metodo_pago === 'transferencia'
							? 'Obligatoria para transferencias.'
							: 'Opcional.')
					}
					slotProps={{ htmlInput: { maxLength: 255 } }}
					sx={{ flex: 1 }}
				/>
			</Stack>
			<TextField
				label="Descripción adicional"
				multiline
				minRows={2}
				value={form.descripcion}
				onChange={(e) => onChange({ ...form, descripcion: e.target.value })}
				disabled={disabled}
			/>
		</Stack>
	);
}
