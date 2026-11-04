import {
	Alert,
	Avatar,
	Box,
	Button,
	Checkbox,
	Chip,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControlLabel,
	MenuItem,
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
import { useId, useState } from 'react';
import { useCategoriasActivasPorDeporte } from '#entities/categoria';
import { useDeportes } from '#entities/deporte';
import { useAuth } from '#entities/session';
import type { SocioListado } from '#entities/socio';
import { leerIntentoInscripcion } from '../model/intentoInscripcion';
import { useInscribirSocio } from '../model/useInscribirSocio';

export interface InscribirSocioDialogProps {
	open: boolean;
	onClose: () => void;
	socio: Pick<SocioListado, 'id' | 'numero_socio' | 'nombre' | 'apellido' | 'estado'>;
}

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

export function InscribirSocioDialog(props: InscribirSocioDialogProps) {
	const { cacheScope } = useAuth();
	return <InscribirSocioContent key={`${cacheScope}:${props.socio.id}`} {...props} />;
}

function InscribirSocioContent({ open, onClose, socio }: InscribirSocioDialogProps) {
	const titleId = useId();
	const { cacheScope, profileStatus, perfil, user, isSigningOut } = useAuth();
	const enabled = open && profileStatus === 'ready' && perfil?.estado === 'activo' && !isSigningOut;
	const [initialTicket] = useState(() => {
		try {
			return user ? leerIntentoInscripcion(user.id, socio.id) : null;
		} catch {
			return null;
		}
	});
	const [deporteId, setDeporteId] = useState(initialTicket?.deporteId ?? '');
	const [categoriaId, setCategoriaId] = useState(initialTicket?.categoriaId ?? '');
	const [approvedSnapshot, setApprovedSnapshot] = useState<string | null>(null);
	const deportes = useDeportes({ cacheScope, enabled, soloActivos: true });
	const categorias = useCategoriasActivasPorDeporte(deporteId || null, { cacheScope, enabled });
	const selectedDeporte = deportes.data?.find((item) => item.id === deporteId);
	const selectedCategoria = categorias.data?.find((item) => item.id === categoriaId);
	const operation = useInscribirSocio({
		open,
		socioId: socio.id,
		categoriaId,
		deporteId,
		selectionEnabled: socio.estado === 'activo' && Boolean(selectedDeporte && selectedCategoria),
	});
	const { previewQuery, result } = operation;
	const preview = !previewQuery.isFetching && !previewQuery.isError ? previewQuery.data : undefined;
	const snapshot = preview
		? JSON.stringify([categoriaId, previewQuery.dataUpdatedAt, preview])
		: null;
	const approved = snapshot !== null && approvedSnapshot === snapshot;
	const blocked =
		operation.isPending ||
		Boolean(operation.pendingTicket) ||
		operation.trackingError ||
		Boolean(result);
	const catalogLoading = deportes.isFetching || categorias.isFetching;
	const catalogError = deportes.isError || categorias.isError;
	const canConfirm =
		operation.enabled &&
		!blocked &&
		!catalogLoading &&
		!catalogError &&
		Boolean(selectedCategoria && preview?.detalle) &&
		!previewQuery.isFetching &&
		approved;
	const close = () => {
		if (!operation.isPending) {
			onClose();
		}
	};
	return (
		<Dialog open={open} fullWidth maxWidth="sm" aria-labelledby={titleId} onClose={close}>
			<DialogTitle id={titleId} sx={{ px: { xs: 2, sm: 3 }, pt: 3, pb: 2 }}>
				Inscribir a actividad
				<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
					Seleccioná un deporte y una categoría para el socio.
				</Typography>
			</DialogTitle>
			<DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, py: 3 }}>
				<Stack spacing={2.5}>
					<Stack
						direction="row"
						spacing={1.5}
						sx={{
							alignItems: 'center',
							p: 2,
							bgcolor: 'action.hover',
							border: '1px solid',
							borderColor: 'divider',
							borderRadius: 2,
						}}
					>
						<Avatar
							sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', width: 40, height: 40 }}
						>
							{socio.nombre.slice(0, 1)}
							{socio.apellido.slice(0, 1)}
						</Avatar>
						<Box sx={{ minWidth: 0, flex: 1 }}>
							<Typography sx={{ overflowWrap: 'anywhere', fontWeight: 700 }}>
								{socio.apellido}, {socio.nombre}
							</Typography>
							<Typography variant="body2" color="text.secondary">
								Socio n.º {socio.numero_socio}
							</Typography>
						</Box>
						<Chip
							label={socio.estado === 'activo' ? 'Activo' : 'Inactivo'}
							size="small"
							color={socio.estado === 'activo' ? 'success' : 'default'}
							variant="outlined"
						/>
					</Stack>
					{socio.estado !== 'activo' && (
						<Alert severity="warning">
							El socio debe estar activo para confirmar una inscripción.
						</Alert>
					)}
					{!operation.enabled && (
						<Alert severity="warning">Necesitás una sesión operativa activa para continuar.</Alert>
					)}
					{operation.trackingError && (
						<Alert severity="error">
							No pudimos verificar si hay una inscripción pendiente. Revisá el registro antes de
							continuar.
						</Alert>
					)}
					{operation.feedback && <Alert severity="warning">{operation.feedback}</Alert>}
					{operation.pendingTicket && !result && (
						<Alert
							severity="warning"
							action={
								<Button
									onClick={() => void operation.checkResult()}
									disabled={operation.isPending || !operation.enabled}
								>
									Consultar resultado
								</Button>
							}
						>
							Hay un intento pendiente de verificar para este socio. Cerrar o recargar la pantalla
							conserva el seguimiento. Consultá el resultado antes de volver a inscribir.
						</Alert>
					)}
					{catalogLoading && (
						<Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
							<CircularProgress size={20} />
							<Typography>Cargando deportes y categorías…</Typography>
						</Box>
					)}
					{catalogError && (
						<Alert
							severity="error"
							action={
								<Button
									onClick={() => {
										void deportes.refetch();
										if (deporteId) {
											void categorias.refetch();
										}
									}}
								>
									Reintentar catálogo
								</Button>
							}
						>
							No pudimos cargar los deportes o las categorías activas.
						</Alert>
					)}
					<TextField
						select
						label="Deporte"
						value={deporteId}
						disabled={!enabled || blocked || socio.estado !== 'activo'}
						onChange={(event) => {
							setDeporteId(event.target.value);
							setCategoriaId('');
							setApprovedSnapshot(null);
						}}
						fullWidth
					>
						<MenuItem value="">Seleccioná un deporte</MenuItem>
						{deporteId && !selectedDeporte && blocked && (
							<MenuItem value={deporteId}>Deporte del intento pendiente</MenuItem>
						)}
						{(deportes.data ?? []).map((item) => (
							<MenuItem key={item.id} value={item.id}>
								{item.nombre}
							</MenuItem>
						))}
					</TextField>
					<TextField
						select
						label="Categoría deportiva"
						value={categoriaId}
						disabled={!enabled || blocked || !deporteId || socio.estado !== 'activo'}
						onChange={(event) => {
							setCategoriaId(event.target.value);
							setApprovedSnapshot(null);
						}}
						fullWidth
					>
						<MenuItem value="">Seleccioná una categoría</MenuItem>
						{categoriaId && !selectedCategoria && blocked && (
							<MenuItem value={categoriaId}>Categoría del intento pendiente</MenuItem>
						)}
						{(categorias.data ?? []).map((item) => (
							<MenuItem key={item.id} value={item.id}>
								{item.nombre} — arancel mensual {money.format(item.arancel_mensual)}
							</MenuItem>
						))}
					</TextField>
					{!catalogLoading && !catalogError && deportes.data?.length === 0 && (
						<Alert severity="info">No hay deportes activos disponibles.</Alert>
					)}
					{deporteId &&
						!catalogLoading &&
						!catalogError &&
						categorias.data?.length === 0 &&
						!operation.pendingTicket && (
							<Alert severity="info">Este deporte no tiene categorías activas disponibles.</Alert>
						)}
					{previewQuery.isFetching && !result && (
						<Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
							<CircularProgress size={20} />
							<Typography>Consultando cuota inicial y cargos del mes…</Typography>
						</Box>
					)}
					{previewQuery.isError && !result && (
						<Alert
							severity="error"
							action={
								<Button onClick={() => void previewQuery.refetch()}>
									Actualizar previsualización
								</Button>
							}
						>
							No pudimos consultar el importe y los cargos. Actualizalos antes de confirmar.
						</Alert>
					)}
					{preview && !result && !operation.pendingTicket && (
						<>
							{!preview.detalle ? (
								<Alert
									severity="warning"
									action={<Button onClick={() => void previewQuery.refetch()}>Actualizar</Button>}
								>
									No hay un importe disponible para confirmar. Verificá que socio, categoría y
									deporte sigan activos.
								</Alert>
							) : (
								<>
									<Box
										component="section"
										aria-label="Cuota inicial proporcional"
										sx={{
											p: 2,
											border: '1px solid',
											borderColor: 'divider',
											borderRadius: 2,
											bgcolor: 'action.hover',
										}}
									>
										<Stack
											direction="row"
											spacing={1}
											sx={{ mb: 1, alignItems: 'center', justifyContent: 'space-between' }}
										>
											<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
												Cuota inicial proporcional
											</Typography>
											<Chip
												size="small"
												color="primary"
												variant="outlined"
												label={`${preview.detalle.tramo_pct}%`}
											/>
										</Stack>
										<Typography variant="h5" color="primary.main" sx={{ fontWeight: 700 }}>
											{money.format(preview.detalle.monto_proporcional)}
										</Typography>
										<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
											Fecha de alta: {preview.fecha.split('-').reverse().join('/')} · Buenos Aires
										</Typography>
										{selectedCategoria && (
											<Typography variant="body2" color="text.secondary">
												Arancel mensual: {money.format(selectedCategoria.arancel_mensual)}
											</Typography>
										)}
										<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
											Se aplica el 100% del día 1 al 10, el 50% del 11 al 20 y el 25% del 21 al fin
											de mes. Revisá el importe antes de confirmar.
										</Typography>
									</Box>
									{preview.detalle.advertencia_edad && (
										<Alert severity="warning">
											La edad ({preview.detalle.edad_socio_anios} años) está fuera del rango de la
											categoría ({preview.detalle.rango_min} a {preview.detalle.rango_max} años).
											Esta advertencia permite confirmar igualmente.
										</Alert>
									)}
								</>
							)}
							<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
								Cuotas del mes · {preview.periodo.mes}/{preview.periodo.anio}
							</Typography>
							{preview.cargos.length === 0 ? (
								<Typography color="text.secondary">
									No hay cuotas guardadas en este período.
								</Typography>
							) : (
								<>
									<TableContainer
										sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
									>
										<Table size="small" aria-label="Cargos del período de inscripción">
											<TableHead sx={{ bgcolor: 'action.hover' }}>
												<TableRow>
													<TableCell>Categoría</TableCell>
													<TableCell>Importe</TableCell>
													<TableCell>Estado</TableCell>
												</TableRow>
											</TableHead>
											<TableBody>
												{preview.cargos.map((cargo) => (
													<TableRow key={cargo.cuota_id}>
														<TableCell>{cargo.categoria_nombre}</TableCell>
														<TableCell>{money.format(cargo.monto)}</TableCell>
														<TableCell>
															{cargo.estado === 'pagada' ? 'Pagada' : 'Pendiente'}
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</TableContainer>
									<Alert severity="warning">
										Las cuotas de otras categorías se conservan y no se compensan. Esta inscripción
										puede agregar un cargo al mes. Si ya existe la cuota de esta categoría, se
										reutiliza.
									</Alert>
								</>
							)}
							{preview.detalle && (
								<FormControlLabel
									control={
										<Checkbox
											checked={approved}
											disabled={blocked || !operation.enabled}
											onChange={(event) =>
												setApprovedSnapshot(event.target.checked ? snapshot : null)
											}
										/>
									}
									label={`Confirmo la inscripción de ${socio.apellido}, ${socio.nombre} en ${selectedCategoria?.nombre ?? 'esta categoría'} con los valores indicados.`}
								/>
							)}
						</>
					)}
					{result && (
						<Alert severity={result.origen === 'confirmada' ? 'success' : 'info'}>
							<Typography variant="subtitle1">
								{result.origen === 'confirmada' ? 'Inscripción confirmada' : 'Resultado recuperado'}
							</Typography>
							<Typography>
								Fecha de alta: {result.inscripcion.fecha_alta.split('-').reverse().join('/')}{' '}
								(Buenos Aires).
							</Typography>
							<Typography>
								Cuota del período {result.cuota.periodo_mes}/{result.cuota.periodo_anio}:{' '}
								{money.format(result.cuota.monto)} —{' '}
								{result.cuota.estado === 'pagada' ? 'Pagada' : 'Pendiente'}.
							</Typography>
							<Typography>
								{result.cuotaCreada === null
									? 'La inscripción y su cuota están registradas. Se recuperó el resultado anterior.'
									: result.cuotaCreada
										? 'Se creó la cuota inicial.'
										: 'Se reutilizó una cuota existente del período.'}
							</Typography>
						</Alert>
					)}
				</Stack>
			</DialogContent>
			<DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 2, gap: 1 }}>
				<Button onClick={close} disabled={operation.isPending}>
					{result ? 'Cerrar' : 'Cancelar'}
				</Button>
				{!result && (
					<Button
						variant="contained"
						disabled={!canConfirm}
						onClick={() => {
							if (preview) {
								void operation.confirm(preview);
							}
						}}
						startIcon={
							operation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined
						}
					>
						{operation.isPending ? 'Verificando…' : 'Confirmar inscripción'}
					</Button>
				)}
			</DialogActions>
		</Dialog>
	);
}
