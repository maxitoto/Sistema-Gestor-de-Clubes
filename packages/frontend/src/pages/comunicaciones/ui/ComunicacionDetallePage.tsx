import {
	Alert,
	Button,
	Chip,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Paper,
	Stack,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TablePagination,
	TableRow,
	Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { type DestinatarioCorreo, getDetalleCorreo } from '#entities/comunicacion';
import { useAuth } from '#entities/session';
import { etiquetaDespacho, etiquetaEntrega, fechaCorreo } from '#shared/lib/comunicaciones';
import { ComunicacionesTabs } from './ComunicacionesTabs';
export function ComunicacionDetallePage() {
	const { cacheScope } = useAuth();
	const { envioId = '' } = useParams();
	return <Detalle key={`${cacheScope}:${envioId}`} id={envioId} />;
}
function Detalle({ id }: { id: string }) {
	const { perfil, cacheScope, profileStatus, isSigningOut } = useAuth();
	const [page, setPage] = useState(1),
		[size, setSize] = useState<20 | 50 | 100>(20),
		[selected, setSelected] = useState<DestinatarioCorreo | null>(null);
	const startRef = useRef(Date.now());
	const q = useQuery({
		queryKey: ['comunicacion-detalle', cacheScope, id, page, size],
		queryFn: ({ signal }) => getDetalleCorreo(id, page, size, perfil?.id ?? '', signal),
		enabled: profileStatus === 'ready' && !isSigningOut,
		retry: 1,
		refetchInterval: (query) =>
			Date.now() - startRef.current < 120000 && query.state.data?.envio.estado === 'procesando'
				? 10000
				: false,
		refetchIntervalInBackground: false,
	});
	useEffect(() => {
		if (q.data) {
			const ultima = Math.max(1, Math.ceil(q.data.total / size));
			if (page > ultima) {
				setPage(ultima);
			}
		}
	}, [q.data, page, size]);
	return (
		<>
			<Button component={Link} to="/comunicaciones" sx={{ mb: 2 }}>
				Volver al historial
			</Button>
			<Typography variant="h4" component="h1" sx={{ mb: 3 }}>
				Detalle de la comunicación
			</Typography>
			<ComunicacionesTabs />
			{q.isLoading && <Typography>Consultando destinatarios…</Typography>}
			{q.isError && (
				<Alert
					severity="error"
					action={<Button onClick={() => void q.refetch()}>Reintentar</Button>}
				>
					{q.error.message}
				</Alert>
			)}
			{q.data && (
				<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
					<Stack spacing={2}>
						<Typography variant="h6" component="h2">
							{q.data.envio.asunto}
						</Typography>
						<Typography>
							{fechaCorreo(q.data.envio.fecha_envio)} ·{' '}
							{q.data.envio.origen === 'automatico'
								? 'Automático'
								: (q.data.envio.autor_nombre ?? 'Autor no disponible')}
						</Typography>
						<Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
							{q.data.envio.cuerpo}
						</Typography>
						<Alert severity="info">
							Cada fila conserva la dirección y el contenido usados para ese envío. La aceptación
							del transporte no confirma la entrega; los excluidos no recibieron un mensaje. El
							resultado puede ser parcial.
						</Alert>
						<Button
							onClick={() => {
								startRef.current = Date.now();
								void q.refetch();
							}}
							disabled={q.isFetching}
						>
							Actualizar resultados
						</Button>
						<TableContainer>
							<Table aria-label="Resultados por destinatario" sx={{ minWidth: 830 }}>
								<TableHead>
									<TableRow>
										<TableCell>Socio y dirección histórica</TableCell>
										<TableCell>Despacho</TableCell>
										<TableCell>Entrega</TableCell>
										<TableCell>Motivo</TableCell>
										<TableCell>Contenido</TableCell>
									</TableRow>
								</TableHead>
								<TableBody>
									{q.data.destinatarios.map((row) => (
										<TableRow key={row.id}>
											<TableCell>
												<Typography>
													{[row.apellido_snapshot, row.nombre_snapshot]
														.filter(Boolean)
														.join(', ') || 'Nombre histórico no disponible'}
												</Typography>
												<Typography variant="body2">{row.email ?? 'Sin correo'}</Typography>
											</TableCell>
											<TableCell>
												<Chip
													size="small"
													label={etiquetaDespacho(row.estado_envio)}
													color={
														row.estado_envio === 'fallido'
															? 'error'
															: row.estado_envio === 'incierto'
																? 'warning'
																: 'default'
													}
												/>
												<Typography variant="caption" sx={{ display: 'block' }}>
													{row.aceptado_en ? `Aceptación: ${fechaCorreo(row.aceptado_en)}` : ''}
												</Typography>
											</TableCell>
											<TableCell>
												<Chip
													size="small"
													label={etiquetaEntrega(row.entrega_estado)}
													color={
														row.entrega_estado === 'entregada'
															? 'success'
															: ['rebote_duro', 'fallida'].includes(row.entrega_estado)
																? 'error'
																: 'default'
													}
												/>
												<Typography variant="caption" sx={{ display: 'block' }}>
													{row.ultimo_evento_en
														? `Último evento: ${fechaCorreo(row.ultimo_evento_en)}`
														: ''}
												</Typography>
											</TableCell>
											<TableCell>{row.motivo ?? 'Sin observaciones'}</TableCell>
											<TableCell>
												<Button onClick={() => setSelected(row)}>Ver contenido</Button>
											</TableCell>
										</TableRow>
									))}
									{!q.data.destinatarios.length && (
										<TableRow>
											<TableCell colSpan={5}>
												Este envío no tiene destinatarios en esta página.
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</TableContainer>
						<TablePagination
							component="div"
							count={q.data.total}
							page={Math.min(page - 1, Math.max(0, Math.ceil(q.data.total / size) - 1))}
							rowsPerPage={size}
							rowsPerPageOptions={[20, 50, 100]}
							labelRowsPerPage="Destinatarios por página"
							labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
							onPageChange={(_, p) => setPage(p + 1)}
							onRowsPerPageChange={(e) => {
								setPage(1);
								setSize(Number(e.target.value) as 20 | 50 | 100);
							}}
						/>
					</Stack>
				</Paper>
			)}
			<Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="md">
				<DialogTitle>Contenido conservado del destinatario</DialogTitle>
				<DialogContent>
					<Stack spacing={2}>
						<Typography>{selected?.email ?? 'Sin correo informado'}</Typography>
						<Typography sx={{ fontWeight: 700 }}>{selected?.asunto_snapshot}</Typography>
						<Typography component="div" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
							{selected?.cuerpo_snapshot}
						</Typography>
						<Typography variant="caption">
							Se muestra el texto histórico. El enlace personal de baja se conserva privado.
						</Typography>
					</Stack>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setSelected(null)}>Cerrar</Button>
				</DialogActions>
			</Dialog>
		</>
	);
}
