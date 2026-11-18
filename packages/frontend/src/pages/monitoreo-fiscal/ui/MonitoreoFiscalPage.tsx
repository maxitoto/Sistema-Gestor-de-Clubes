import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import {
	Alert,
	Box,
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
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
	type AccionMonitoreo,
	type CriteriosMonitoreo,
	criteriosMonitoreoIniciales,
	type FilaMonitoreo,
	getMonitoreoFiscal,
	puedeAccionFiscal,
	tituloAccionFiscal,
} from '#entities/monitoreo-fiscal';
import { useAuth } from '#entities/session';
import { FiscalComprobantePanel } from '#features/comprobante-fiscal';
import { AccionFiscalDialog } from '#features/regularizar-comprobante';
import { fechaCobranza, monedaCobranza } from '#shared/types/cobranza';

const stateLabel = (state: FilaMonitoreo['estadoFiscal']) =>
	({
		pendiente_cae: 'Pendiente de CAE',
		fallido: 'Fiscal fallido',
		anulacion_pendiente: 'Anulación fiscal pendiente',
	})[state];
export function MonitoreoFiscalPage() {
	const { cacheScope } = useAuth();
	return <MonitoreoPanel key={cacheScope} />;
}
function MonitoreoPanel() {
	const { perfil, cacheScope, profileStatus, isSigningOut } = useAuth(),
		actorId = perfil?.id ?? '',
		admin = perfil?.rol === 'admin';
	const [criteria, setCriteria] = useState<CriteriosMonitoreo>(criteriosMonitoreoIniciales),
		[search, setSearch] = useState(''),
		[detail, setDetail] = useState<FilaMonitoreo | null>(null),
		[action, setAction] = useState<{ fila: FilaMonitoreo; accion: AccionMonitoreo } | null>(null);
	const enabled = profileStatus === 'ready' && !isSigningOut;
	const query = useQuery({
		queryKey: ['monitoreo-fiscal', cacheScope, criteria],
		queryFn: ({ signal }) => getMonitoreoFiscal(criteria, actorId, signal),
		enabled,
		retry: 1,
	});
	useEffect(() => {
		const timeout = setTimeout(() => setCriteria((c) => ({ ...c, q: search, page: 1 })), 300);
		return () => clearTimeout(timeout);
	}, [search]);
	useEffect(() => {
		if (query.data) {
			const last = Math.max(1, Math.ceil(query.data.total / criteria.pageSize));
			if (criteria.page > last) {
				setCriteria((c) => ({ ...c, page: last }));
			}
		}
	}, [query.data, criteria.page, criteria.pageSize]);
	const change = <K extends keyof CriteriosMonitoreo>(key: K, value: CriteriosMonitoreo[K]) =>
		setCriteria((c) => ({ ...c, [key]: value, page: 1 }));
	const refresh = () => {
		void query.refetch();
		setDetail(null);
	};
	const buttons = (row: FilaMonitoreo) => (
		<Stack spacing={0.5} sx={{ minWidth: 150 }}>
			<Button size="small" onClick={() => setDetail(row)}>
				Ver detalle fiscal
			</Button>
			{admin &&
				(['forzar', 'reabrir', 'resolver', 'registrar-externo'] as const).map((a) => {
					const key = a === 'registrar-externo' ? 'registrarExterno' : a;
					return row.acciones[key] ? (
						<Button
							size="small"
							variant="outlined"
							key={a}
							disabled={!puedeAccionFiscal(row, a, admin, query.data?.externoHabilitado ?? false)}
							onClick={() => setAction({ fila: row, accion: a })}
						>
							{tituloAccionFiscal(a)}
						</Button>
					) : null;
				})}
		</Stack>
	);
	return (
		<Stack spacing={3}>
			<Box>
				<Button component={Link} to="/pagos" startIcon={<ArrowBackOutlinedIcon />}>
					Volver a Cobranza
				</Button>
				<Typography component="h1" variant="h4" sx={{ mt: 1 }}>
					Monitoreo fiscal
				</Typography>
				<Typography color="text.secondary" sx={{ mt: 1 }}>
					Facturas y notas de crédito con autorización o anulación pendientes e incidencias para
					revisar.
				</Typography>
			</Box>
			<Alert severity="info">
				Las acciones fiscales conservan pago, cuota y caja. Un cobro anulado puede tener una Nota de
				Crédito pendiente y la cuota ya puede haber sido cobrada nuevamente.
			</Alert>
			{query.data && !query.data.externoHabilitado && (
				<Alert severity="info">
					La conexión de homologación está pendiente de habilitación. Podés consultar las
					incidencias y su documentación; las acciones que requieren consultar ARCA estarán
					disponibles al completar esa configuración.
				</Alert>
			)}
			{!admin && (
				<Typography color="text.secondary">
					Tu perfil permite consultar el monitoreo. Las acciones de regularización requieren un
					Administrador.
				</Typography>
			)}
			<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
				<Stack spacing={2}>
					<Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
						<TextField
							size="small"
							label="Nombre, apellido o DNI"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							slotProps={{ htmlInput: { maxLength: 100 } }}
							sx={{ flex: 1, minWidth: 180 }}
						/>
						<TextField
							size="small"
							select
							label="Estado fiscal"
							value={criteria.estado}
							onChange={(e) => change('estado', e.target.value as CriteriosMonitoreo['estado'])}
							sx={{ minWidth: 200 }}
						>
							<MenuItem value="todos">Todas las incidencias</MenuItem>
							<MenuItem value="pendiente_cae">Pendiente de CAE</MenuItem>
							<MenuItem value="fallido">Fiscal fallido</MenuItem>
							<MenuItem value="anulacion_pendiente">Anulación pendiente</MenuItem>
						</TextField>
						<TextField
							size="small"
							select
							label="Tipo de documento"
							value={criteria.tipo}
							onChange={(e) => change('tipo', e.target.value as CriteriosMonitoreo['tipo'])}
							sx={{ minWidth: 180 }}
						>
							<MenuItem value="todos">Todos</MenuItem>
							<MenuItem value="factura">Factura</MenuItem>
							<MenuItem value="nota_credito">Nota de Crédito</MenuItem>
						</TextField>
					</Stack>
					<Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
						<TextField
							size="small"
							label="Cobros desde"
							type="date"
							value={criteria.desde}
							onChange={(e) => change('desde', e.target.value)}
							slotProps={{ inputLabel: { shrink: true } }}
						/>
						<TextField
							size="small"
							label="Cobros hasta"
							type="date"
							value={criteria.hasta}
							onChange={(e) => change('hasta', e.target.value)}
							slotProps={{ inputLabel: { shrink: true } }}
						/>
						<Button
							onClick={() => {
								setCriteria(criteriosMonitoreoIniciales());
								setSearch('');
							}}
						>
							Limpiar filtros
						</Button>
						<Button disabled={query.isFetching} onClick={() => void query.refetch()}>
							Actualizar
						</Button>
					</Stack>
					{query.data && (
						<Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
							<Chip variant="outlined" label={`Pendientes: ${query.data.conteos.pendientes}`} />
							<Chip variant="outlined" label={`Fallidos: ${query.data.conteos.fallidos}`} />
							<Chip
								variant="outlined"
								label={`Anulación pendiente: ${query.data.conteos.anulacionPendiente}`}
							/>
						</Stack>
					)}
					{query.isError ? (
						<Alert severity="warning">
							No pudimos consultar el monitoreo fiscal. Revisá fechas, permisos y conexión, y
							actualizá la consulta.
						</Alert>
					) : (
						<>
							<TableContainer>
								<Table size="small" aria-label="Incidencias fiscales">
									<TableHead>
										<TableRow>
											{[
												'Socio',
												'Documento',
												'Fecha del cobro',
												'Importe',
												'Reintentos iniciados',
												'Ventana y próximo reintento',
												'Estado fiscal',
												'Acciones',
											].map((label) => (
												<TableCell key={label}>{label}</TableCell>
											))}
										</TableRow>
									</TableHead>
									<TableBody>
										{query.isPending ? (
											<TableRow>
												<TableCell colSpan={8}>Cargando incidencias…</TableCell>
											</TableRow>
										) : !query.data?.items.length ? (
											<TableRow>
												<TableCell colSpan={8}>
													No se encontraron incidencias para esta consulta.
												</TableCell>
											</TableRow>
										) : (
											query.data.items.map((row) => (
												<TableRow key={row.comprobanteId}>
													<TableCell>
														<Typography variant="body2" sx={{ fontWeight: 600 }}>
															{row.socio.apellido}, {row.socio.nombre}
														</Typography>
														<Typography variant="caption">
															Socio {row.socio.nroSocio} · DNI {row.socio.dni}
														</Typography>
													</TableCell>
													<TableCell>
														{row.tipo === 'nota_credito' ? 'Nota de Crédito' : 'Factura'}
														{row.numero && (
															<Typography variant="caption" component="p">
																Número {row.numero}
															</Typography>
														)}
														{row.origenId && (
															<Typography variant="caption" component="p">
																Vinculada a factura original
															</Typography>
														)}
														{row.ncId && (
															<Typography variant="caption" component="p">
																Con Nota de Crédito asociada
															</Typography>
														)}
													</TableCell>
													<TableCell>{fechaCobranza(row.fechaCobro)}</TableCell>
													<TableCell sx={{ whiteSpace: 'nowrap' }}>
														{monedaCobranza(row.monto)}
													</TableCell>
													<TableCell>{row.intentos} / 6</TableCell>
													<TableCell sx={{ minWidth: 160 }}>
														{row.ventanaFin ? (
															<Typography variant="caption" component="p">
																Hasta {fechaCobranza(row.ventanaFin)}
															</Typography>
														) : (
															<Typography variant="caption">Sin ventana vigente</Typography>
														)}
														<Typography variant="caption" component="p">
															{row.proximoReintento
																? fechaCobranza(row.proximoReintento)
																: 'Sin próximo reintento programado'}
														</Typography>
													</TableCell>
													<TableCell>
														<Chip
															size="small"
															color={row.estadoFiscal === 'fallido' ? 'warning' : 'default'}
															label={stateLabel(row.estadoFiscal)}
														/>
														<Typography variant="caption" component="p" sx={{ mt: 0.5 }}>
															{row.pagoEstado === 'anulado' ? 'Cobro anulado' : 'Cobro confirmado'}
														</Typography>
														{row.bloqueo && (
															<Typography variant="caption" color="text.secondary" component="p">
																{row.bloqueo}
															</Typography>
														)}
													</TableCell>
													<TableCell>{buttons(row)}</TableCell>
												</TableRow>
											))
										)}
									</TableBody>
								</Table>
							</TableContainer>
							<TablePagination
								component="div"
								count={query.data?.total ?? 0}
								page={criteria.page - 1}
								rowsPerPage={criteria.pageSize}
								rowsPerPageOptions={[20, 50, 100]}
								onPageChange={(_, page) => setCriteria((c) => ({ ...c, page: page + 1 }))}
								onRowsPerPageChange={(e) =>
									change('pageSize', Number(e.target.value) as 20 | 50 | 100)
								}
								labelRowsPerPage="Filas por página"
								labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
							/>
						</>
					)}
				</Stack>
			</Paper>
			{detail && (
				<Dialog open fullWidth maxWidth="sm" onClose={() => setDetail(null)}>
					<DialogTitle>Detalle fiscal</DialogTitle>
					<DialogContent>
						<Stack spacing={2} sx={{ pt: 1 }}>
							<Typography variant="h6">
								{detail.socio.apellido}, {detail.socio.nombre}
							</Typography>
							<Typography>
								{detail.tipo === 'nota_credito' ? 'Nota de Crédito' : 'Factura'} ·{' '}
								{stateLabel(detail.estadoFiscal)} · {monedaCobranza(detail.monto)}
							</Typography>
							<Typography>Fecha del cobro: {fechaCobranza(detail.fechaCobro)}</Typography>
							{detail.detalleError && <Alert severity="warning">{detail.detalleError}</Alert>}
							<FiscalComprobantePanel
								key={`${cacheScope}:${detail.comprobanteId}`}
								comprobanteId={detail.comprobanteId}
								onUpdated={refresh}
							/>
							<Button component={Link} to={`/pagos?pagoId=${detail.pagoId}`}>
								Ver cobro y documentos relacionados
							</Button>
						</Stack>
					</DialogContent>
					<DialogActions>
						<Button onClick={() => setDetail(null)}>Cerrar</Button>
					</DialogActions>
				</Dialog>
			)}
			{action && (
				<AccionFiscalDialog
					key={`${cacheScope}:${action.fila.comprobanteId}:${action.accion}`}
					fila={action.fila}
					accion={action.accion}
					onClose={() => setAction(null)}
					onUpdated={refresh}
				/>
			)}
		</Stack>
	);
}
