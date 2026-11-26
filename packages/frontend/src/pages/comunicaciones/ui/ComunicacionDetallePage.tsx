import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import {
	Alert,
	Button,
	Chip,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Divider,
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
import { EmptyState, InfoTooltip, PageHeader } from '#shared/ui';
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
		<Stack spacing={3}>
			<PageHeader
				back={
					<Button component={Link} to="/comunicaciones" size="small" startIcon={<ArrowBackIcon />}>
						Volver al historial
					</Button>
				}
				title="Detalle de la comunicación"
				actions={
					<Button
						variant="outlined"
						size="small"
						startIcon={<RefreshOutlinedIcon />}
						onClick={() => {
							startRef.current = Date.now();
							void q.refetch();
						}}
						disabled={q.isFetching}
					>
						Actualizar resultados
					</Button>
				}
			/>

			<ComunicacionesTabs />

			{q.isLoading ? (
				<Stack
					direction="row"
					spacing={1.5}
					sx={{ py: 6, justifyContent: 'center', alignItems: 'center' }}
				>
					<CircularProgress size={20} />
					<Typography variant="body2" color="text.secondary">
						Consultando destinatarios…
					</Typography>
				</Stack>
			) : q.isError ? (
				<Alert
					severity="error"
					action={
						<Button size="small" color="inherit" onClick={() => void q.refetch()}>
							Reintentar
						</Button>
					}
				>
					{q.error.message}
				</Alert>
			) : q.data ? (
				<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
					<Stack spacing={2.5}>
						<Paper variant="outlined" sx={{ p: 2.25, bgcolor: 'action.hover' }}>
							<Typography variant="h6" component="h2">
								{q.data.envio.asunto}
							</Typography>
							<Typography
								variant="caption"
								color="text.secondary"
								sx={{ display: 'block', mt: 0.5, fontVariantNumeric: 'tabular-nums' }}
							>
								{fechaCorreo(q.data.envio.fecha_envio)} ·{' '}
								{q.data.envio.origen === 'automatico'
									? 'Envío automático'
									: (q.data.envio.autor_nombre ?? 'Autor no disponible')}
							</Typography>
							<Divider sx={{ my: 1.5 }} />
							<Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
								{q.data.envio.cuerpo}
							</Typography>
						</Paper>

						<Typography variant="caption" color="text.secondary">
							Cada fila conserva la dirección y el texto usados al momento del envío. Los socios
							excluidos no recibieron correo.
						</Typography>

						{!q.data.destinatarios.length ? (
							<EmptyState
								title="Sin destinatarios en esta página"
								description="Este envío no tiene registros para mostrar aquí."
							/>
						) : (
							<>
								<TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
									<Table
										size="small"
										aria-label="Resultados por destinatario"
										sx={{ minWidth: 820 }}
									>
										<TableHead>
											<TableRow>
												<TableCell>Socio y correo histórico</TableCell>
												<TableCell>
													<Stack direction="row" spacing={0.25} sx={{ alignItems: 'center' }}>
														<span>Despacho</span>
														<InfoTooltip
															label="Qué significa Despacho"
															title="Indica si el servidor de correo aceptó el mensaje para su envío (no garantiza todavía que haya llegado a la casilla del destinatario)."
														/>
													</Stack>
												</TableCell>
												<TableCell>
													<Stack direction="row" spacing={0.25} sx={{ alignItems: 'center' }}>
														<span>Entrega</span>
														<InfoTooltip
															label="Qué significa Entrega"
															title="Refleja la confirmación o rebote informado por la casilla receptora del socio."
														/>
													</Stack>
												</TableCell>
												<TableCell>Observaciones</TableCell>
												<TableCell align="right">Contenido</TableCell>
											</TableRow>
										</TableHead>
										<TableBody>
											{q.data.destinatarios.map((row) => (
												<TableRow key={row.id}>
													<TableCell>
														<Typography variant="body2" sx={{ fontWeight: 600 }}>
															{[row.apellido_snapshot, row.nombre_snapshot]
																.filter(Boolean)
																.join(', ') || 'Nombre histórico no disponible'}
														</Typography>
														<Typography variant="caption" color="text.secondary">
															{row.email ?? 'Sin correo'}
														</Typography>
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
																		: row.estado_envio === 'aceptado'
																			? 'info'
																			: 'default'
															}
														/>
														{row.aceptado_en && (
															<Typography
																variant="caption"
																color="text.secondary"
																sx={{
																	display: 'block',
																	mt: 0.25,
																	fontVariantNumeric: 'tabular-nums',
																}}
															>
																{fechaCorreo(row.aceptado_en)}
															</Typography>
														)}
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
																		: row.entrega_estado === 'demorada'
																			? 'warning'
																			: 'default'
															}
														/>
														{row.ultimo_evento_en && (
															<Typography
																variant="caption"
																color="text.secondary"
																sx={{
																	display: 'block',
																	mt: 0.25,
																	fontVariantNumeric: 'tabular-nums',
																}}
															>
																{fechaCorreo(row.ultimo_evento_en)}
															</Typography>
														)}
													</TableCell>
													<TableCell>
														<Typography variant="body2" color="text.secondary">
															{row.motivo ?? 'Sin observaciones'}
														</Typography>
													</TableCell>
													<TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
														<Button
															size="small"
															variant="outlined"
															onClick={() => setSelected(row)}
														>
															Ver mensaje
														</Button>
													</TableCell>
												</TableRow>
											))}
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
							</>
						)}
					</Stack>
				</Paper>
			) : null}

			<Dialog
				open={Boolean(selected)}
				onClose={() => setSelected(null)}
				fullWidth
				maxWidth="md"
				aria-labelledby="destinatario-contenido-title"
			>
				<DialogTitle id="destinatario-contenido-title">
					Mensaje conservado del destinatario
				</DialogTitle>
				<DialogContent dividers>
					<Stack spacing={2}>
						<Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover' }}>
							<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
								Destinatario: {selected?.email ?? 'Sin correo informado'}
							</Typography>
							<Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 0.5 }}>
								{selected?.asunto_snapshot}
							</Typography>
							<Divider sx={{ my: 1.5 }} />
							<Typography
								component="div"
								variant="body2"
								sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
							>
								{selected?.cuerpo_snapshot}
							</Typography>
						</Paper>
						<Typography variant="caption" color="text.secondary">
							Se muestra el texto histórico enviado. El enlace personal de desuscripción se conserva
							privado.
						</Typography>
					</Stack>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setSelected(null)}>Cerrar</Button>
				</DialogActions>
			</Dialog>
		</Stack>
	);
}
