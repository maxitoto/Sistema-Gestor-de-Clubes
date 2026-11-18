import {
	Alert,
	Button,
	Chip,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	MenuItem,
	Paper,
	Stack,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TablePagination,
	TableRow,
	TextField,
	Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
	cambiarEstadoPlantilla,
	getPlantillasCorreo,
	type PlantillaCorreo,
} from '#entities/plantilla-correo';
import { useAuth } from '#entities/session';
import { TemplateForm } from '#features/manage-email-template';
import { ComunicacionesTabs } from './ComunicacionesTabs';
export function PlantillasPage() {
	const { cacheScope } = useAuth();
	return <Plantillas key={cacheScope} />;
}
function Plantillas() {
	const { perfil, profileStatus, isSigningOut, cacheScope } = useAuth(),
		client = useQueryClient();
	const [page, setPage] = useState(1),
		[size, setSize] = useState<20 | 50 | 100>(20),
		[estado, setEstado] = useState('todos'),
		[form, setForm] = useState<{ plantilla: PlantillaCorreo | null } | null>(null),
		[change, setChange] = useState<PlantillaCorreo | null>(null),
		[busy, setBusy] = useState(false),
		[error, setError] = useState<string | null>(null),
		[success, setSuccess] = useState('');
	const lockRef = useRef(false),
		abortRef = useRef<AbortController | null>(null),
		aliveRef = useRef(true);
	useEffect(() => {
		aliveRef.current = true;
		return () => {
			aliveRef.current = false;
			abortRef.current?.abort();
		};
	}, []);
	const q = useQuery({
		queryKey: ['plantillas-correo', cacheScope, page, size, estado],
		queryFn: ({ signal }) => getPlantillasCorreo(page, size, estado, perfil?.id ?? '', signal),
		enabled: profileStatus === 'ready' && !isSigningOut,
		retry: 1,
	});
	const refresh = () => {
		void client.invalidateQueries({ queryKey: ['plantillas-correo', cacheScope] });
		void client.invalidateQueries({ queryKey: ['email-templates', cacheScope] });
	};
	const confirm = async () => {
		if (!change || lockRef.current || profileStatus !== 'ready' || isSigningOut) {
			return;
		}
		lockRef.current = true;
		setBusy(true);
		setError(null);
		const c = new AbortController();
		abortRef.current = c;
		try {
			await cambiarEstadoPlantilla(
				change.id,
				change.estado === 'activo' ? 'inactivo' : 'activo',
				perfil?.id ?? '',
				c.signal,
			);
			if (aliveRef.current) {
				setSuccess(
					change.estado === 'activo'
						? 'Plantilla desactivada. Los envíos históricos se conservan.'
						: 'Plantilla activada y disponible para futuras comunicaciones.',
				);
				setChange(null);
				refresh();
			}
		} catch (e) {
			if (aliveRef.current) {
				setError(e instanceof Error ? e.message : 'No se confirmó el cambio.');
				refresh();
			}
		} finally {
			if (aliveRef.current) {
				setBusy(false);
				lockRef.current = false;
			}
		}
	};
	return (
		<>
			<Typography variant="h4" component="h1" sx={{ mb: 3 }}>
				Plantillas de correo
			</Typography>
			<ComunicacionesTabs />
			<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
				<Stack spacing={2}>
					<Stack
						direction={{ xs: 'column', sm: 'row' }}
						spacing={2}
						sx={{ justifyContent: 'space-between' }}
					>
						<TextField
							select
							label="Estado de plantilla"
							value={estado}
							onChange={(e) => {
								setEstado(e.target.value);
								setPage(1);
							}}
							sx={{ minWidth: 180 }}
						>
							<MenuItem value="todos">Todas</MenuItem>
							<MenuItem value="activo">Activas</MenuItem>
							<MenuItem value="inactivo">Inactivas</MenuItem>
						</TextField>
						<Button
							variant="contained"
							onClick={() => {
								setError(null);
								setSuccess('');
								setForm({ plantilla: null });
							}}
						>
							Nueva plantilla
						</Button>
					</Stack>
					<Typography color="text.secondary">
						Usá texto simple con etiquetas. La edición o baja lógica conserva los mensajes
						históricos.
					</Typography>
					{success && <Alert severity="success">{success}</Alert>}
					{error && <Alert severity="error">{error}</Alert>}
					{q.isLoading && <Typography>Consultando plantillas…</Typography>}
					{q.isError && (
						<Alert
							severity="error"
							action={<Button onClick={() => void q.refetch()}>Reintentar</Button>}
						>
							{q.error.message}
						</Alert>
					)}
					{q.data && (
						<>
							<TableContainer>
								<Table aria-label="Plantillas de correo" sx={{ minWidth: 650 }}>
									<TableHead>
										<TableRow>
											<TableCell>Nombre interno</TableCell>
											<TableCell>Asunto</TableCell>
											<TableCell>Estado</TableCell>
											<TableCell>Acciones</TableCell>
										</TableRow>
									</TableHead>
									<TableBody>
										{q.data.plantillas.map((p) => (
											<TableRow key={p.id}>
												<TableCell>{p.nombre_interno}</TableCell>
												<TableCell>{p.asunto}</TableCell>
												<TableCell>
													<Chip
														size="small"
														label={p.estado === 'activo' ? 'Activa' : 'Inactiva'}
														color={p.estado === 'activo' ? 'success' : 'default'}
													/>
												</TableCell>
												<TableCell>
													<Button
														onClick={() => {
															setError(null);
															setSuccess('');
															setForm({ plantilla: p });
														}}
													>
														Editar
													</Button>
													<Button
														color={p.estado === 'activo' ? 'error' : 'primary'}
														onClick={() => {
															setError(null);
															setChange(p);
														}}
													>
														{p.estado === 'activo' ? 'Desactivar' : 'Activar'}
													</Button>
												</TableCell>
											</TableRow>
										))}
										{!q.data.plantillas.length && (
											<TableRow>
												<TableCell colSpan={4}>No hay plantillas para este filtro.</TableCell>
											</TableRow>
										)}
									</TableBody>
								</Table>
							</TableContainer>
							<TablePagination
								component="div"
								count={q.data.total}
								page={page - 1}
								rowsPerPage={size}
								rowsPerPageOptions={[20, 50, 100]}
								labelRowsPerPage="Filas por página"
								labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
								onPageChange={(_, p) => setPage(p + 1)}
								onRowsPerPageChange={(e) => {
									setPage(1);
									setSize(Number(e.target.value) as 20 | 50 | 100);
								}}
							/>
						</>
					)}
				</Stack>
			</Paper>
			{form && (
				<TemplateForm
					plantilla={form.plantilla}
					onClose={() => setForm(null)}
					onSaved={() => {
						setSuccess('Plantilla guardada correctamente.');
						refresh();
					}}
				/>
			)}
			<Dialog
				open={Boolean(change)}
				fullWidth
				maxWidth="sm"
				onClose={() => {
					if (!busy) {
						setChange(null);
					}
				}}
			>
				<DialogTitle>
					{change?.estado === 'activo' ? 'Desactivar plantilla' : 'Activar plantilla'}
				</DialogTitle>
				<DialogContent>
					<Typography>{change?.nombre_interno}</Typography>
					<Typography sx={{ mt: 2 }}>
						{change?.estado === 'activo'
							? 'Dejará de aparecer en nuevas comunicaciones. Los envíos anteriores conservan el asunto y el mensaje usados.'
							: 'Volverá a estar disponible para preparar nuevas comunicaciones.'}
					</Typography>
					{error && (
						<Alert severity="error" sx={{ mt: 2 }}>
							{error}
						</Alert>
					)}
				</DialogContent>
				<DialogActions>
					<Button disabled={busy} onClick={() => setChange(null)}>
						Cancelar
					</Button>
					<Button disabled={busy} variant="contained" onClick={() => void confirm()}>
						{busy ? 'Confirmando…' : 'Confirmar'}
					</Button>
				</DialogActions>
			</Dialog>
		</>
	);
}
