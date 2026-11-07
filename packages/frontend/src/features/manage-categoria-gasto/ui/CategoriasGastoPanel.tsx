import {
	Alert,
	Button,
	Chip,
	MenuItem,
	Paper,
	Stack,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	TextField,
	Typography,
} from '@mui/material';
import { useState } from 'react';
import { type CategoriaGasto, useCategoriasGasto } from '#entities/categoria-gasto';
import { useAuth } from '#entities/session';
import { BajaCategoriaGastoDialog } from './BajaCategoriaGastoDialog';
import { CategoriaGastoDialog } from './CategoriaGastoDialog';
export function CategoriasGastoPanel() {
	const { cacheScope } = useAuth();
	return <Panel key={cacheScope} />;
}
function Panel() {
	const { cacheScope, perfil, profileStatus, isSigningOut } = useAuth();
	const enabled = profileStatus === 'ready' && perfil?.rol === 'admin' && !isSigningOut;
	const query = useCategoriasGasto({ cacheScope, enabled });
	const [estado, setEstado] = useState('todos');
	const [edit, setEdit] = useState<{ categoria: CategoriaGasto | null } | null>(null);
	const [baja, setBaja] = useState<CategoriaGasto | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const saved = () => {
		setEdit(null);
		setBaja(null);
		setNotice('Categoría guardada.');
		void query.refetch();
	};
	if (!enabled) {
		return (
			<Alert severity="warning">La gestión de categorías está reservada al Administrador.</Alert>
		);
	}
	return (
		<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
			<Stack spacing={2}>
				{notice && (
					<Alert severity="success" onClose={() => setNotice(null)}>
						{notice}
					</Alert>
				)}
				<Stack
					direction={{ xs: 'column', sm: 'row' }}
					spacing={2}
					sx={{ justifyContent: 'space-between' }}
				>
					<Typography variant="h6" component="h2">
						Categorías de gasto
					</Typography>
					<Button variant="contained" onClick={() => setEdit({ categoria: null })}>
						Nueva categoría
					</Button>
				</Stack>
				<Typography color="text.secondary">
					Clasificá los egresos sin borrar sus referencias históricas.
				</Typography>
				<TextField
					size="small"
					select
					label="Estado"
					value={estado}
					onChange={(e) => setEstado(e.target.value)}
					sx={{ maxWidth: 220 }}
				>
					<MenuItem value="todos">Activas e inactivas</MenuItem>
					<MenuItem value="activo">Activas</MenuItem>
					<MenuItem value="inactivo">Inactivas</MenuItem>
				</TextField>
				{query.isPending ? (
					<Typography>Cargando categorías…</Typography>
				) : query.isError ? (
					<Alert
						severity="error"
						action={<Button onClick={() => void query.refetch()}>Reintentar</Button>}
					>
						No pudimos cargar las categorías.
					</Alert>
				) : (
					<TableContainer>
						<Table size="small" aria-label="Categorías de gasto">
							<TableHead>
								<TableRow>
									{['Categoría', 'Descripción', 'Estado', 'Acciones'].map((x) => (
										<TableCell key={x}>{x}</TableCell>
									))}
								</TableRow>
							</TableHead>
							<TableBody>
								{query.data.filter((c) => estado === 'todos' || c.estado === estado).length ===
								0 ? (
									<TableRow>
										<TableCell colSpan={4}>No hay categorías para este estado.</TableCell>
									</TableRow>
								) : (
									query.data
										.filter((c) => estado === 'todos' || c.estado === estado)
										.map((c) => (
											<TableRow key={c.id}>
												<TableCell>{c.nombre}</TableCell>
												<TableCell>{c.descripcion ?? '—'}</TableCell>
												<TableCell>
													<Chip
														size="small"
														variant="outlined"
														color={c.estado === 'activo' ? 'success' : 'default'}
														label={c.estado === 'activo' ? 'Activa' : 'Inactiva'}
													/>
												</TableCell>
												<TableCell>
													<Stack direction="row" spacing={1}>
														<Button size="small" onClick={() => setEdit({ categoria: c })}>
															Editar
														</Button>
														{c.estado === 'activo' && (
															<Button size="small" color="error" onClick={() => setBaja(c)}>
																Dar de baja
															</Button>
														)}
													</Stack>
												</TableCell>
											</TableRow>
										))
								)}
							</TableBody>
						</Table>
					</TableContainer>
				)}
				{edit && (
					<CategoriaGastoDialog
						categoria={edit.categoria}
						onClose={() => setEdit(null)}
						onSaved={saved}
					/>
				)}{' '}
				{baja && (
					<BajaCategoriaGastoDialog
						categoria={baja}
						onClose={() => setBaja(null)}
						onSaved={saved}
					/>
				)}
			</Stack>
		</Paper>
	);
}
