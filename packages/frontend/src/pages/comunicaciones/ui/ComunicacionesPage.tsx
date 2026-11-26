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
	TablePagination,
	TableRow,
	TableSortLabel,
	TextField,
	Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
	type CriteriosHistorial,
	criteriosHistorialIniciales,
	type EnvioCorreo,
	getHistorialCorreo,
	getReporteCorreos,
} from '#entities/comunicacion';
import { useAuth } from '#entities/session';
import { type ColumnaExportacion, ExportGridButton } from '#features/export-grid';
import { fechaCorreo, rangoDiasCorreo } from '#shared/lib/comunicaciones';
import { ComunicacionesTabs } from './ComunicacionesTabs';

const columnasExportacionCorreos: ColumnaExportacion<EnvioCorreo>[] = [
	{ titulo: 'Fecha y hora del club', tipo: 'texto', valor: (e) => fechaCorreo(e.fecha_envio) },
	{ titulo: 'Asunto', tipo: 'texto', valor: (e) => e.asunto },
	{
		titulo: 'Tipo',
		tipo: 'texto',
		valor: (e) =>
			e.tipo === 'general'
				? 'Comunicación general'
				: e.tipo === 'deuda'
					? 'Aviso de deuda'
					: 'Notificación de operación',
	},
	{
		titulo: 'Origen',
		tipo: 'texto',
		valor: (e) => (e.origen === 'automatico' ? 'Automático' : 'Manual'),
	},
	{
		titulo: 'Autor',
		tipo: 'texto',
		valor: (e) =>
			e.origen === 'automatico' ? 'Automático' : (e.autor_nombre ?? 'Autor no disponible'),
	},
	{ titulo: 'Destinatarios', tipo: 'numero', valor: (e) => e.destinatarios_count },
	{
		titulo: 'Estado del envío',
		tipo: 'texto',
		valor: (e) =>
			e.estado === 'enviado'
				? 'Aceptado por proveedor'
				: e.estado === 'fallido'
					? 'Con fallos'
					: 'Procesando',
	},
];
export function ComunicacionesPage() {
	const { cacheScope } = useAuth();
	return <Historial key={cacheScope} />;
}
function Historial() {
	const { perfil, cacheScope, profileStatus, isSigningOut } = useAuth();
	const [searchParams] = useSearchParams();
	const desdeUrl = searchParams.get('desde') ?? '',
		hastaUrl = searchParams.get('hasta') ?? '';
	const [c, setC] = useState<CriteriosHistorial>(() => ({
		...criteriosHistorialIniciales,
		desde: desdeUrl,
		hasta: hastaUrl,
	}));
	useEffect(() => {
		setC((x) => ({ ...x, desde: desdeUrl, hasta: hastaUrl, page: 1 }));
	}, [desdeUrl, hastaUrl]);
	const startRef = useRef(Date.now());
	useEffect(() => {
		startRef.current = Date.now();
	}, []);
	let issue: string | null = null;
	try {
		rangoDiasCorreo(c.desde, c.hasta);
	} catch (e) {
		issue = e instanceof Error ? e.message : 'Revisá el período.';
	}
	const q = useQuery({
		queryKey: ['comunicaciones-historial', cacheScope, c],
		queryFn: ({ signal }) => getHistorialCorreo(c, perfil?.id ?? '', signal),
		enabled: profileStatus === 'ready' && !isSigningOut && !issue,
		retry: 1,
		refetchInterval: (query) =>
			Date.now() - startRef.current < 120000 &&
			query.state.data?.envios.some((x) => x.estado === 'procesando')
				? 10000
				: false,
		refetchIntervalInBackground: false,
	});
	useEffect(() => {
		if (q.data) {
			const ultima = Math.max(1, Math.ceil(q.data.total / c.pageSize));
			if (c.page > ultima) {
				setC((x) => ({ ...x, page: ultima }));
			}
		}
	}, [q.data, c.page, c.pageSize]);
	const sort = (sortBy: CriteriosHistorial['sortBy']) =>
		setC((x) => ({
			...x,
			page: 1,
			sortBy,
			sortOrder: x.sortBy === sortBy && x.sortOrder === 'desc' ? 'asc' : 'desc',
		}));
	return (
		<>
			<Typography variant="h4" component="h1" sx={{ mb: 1 }}>
				Comunicaciones
			</Typography>
			<Typography color="text.secondary" sx={{ mb: 3 }}>
				Consultá el contenido conservado y el resultado de cada destinatario.
			</Typography>
			<ComunicacionesTabs />
			<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
				<Stack spacing={2}>
					<Typography component="h2" variant="h6">
						Historial de envíos
					</Typography>
					<ExportGridButton
						nombreArchivo="correos"
						filtroSnapshot={c}
						orden={{ campo: c.sortBy, direccion: c.sortOrder }}
						columnas={columnasExportacionCorreos}
						claveFila={(e) => e.id}
						disabled={
							profileStatus !== 'ready' || isSigningOut || !!issue || q.isLoading || q.isError
						}
						obtenerPagina={async (p) => {
							const resultado = await getReporteCorreos(
								{
									...p.filtro,
									sortBy: p.orden.campo as CriteriosHistorial['sortBy'],
									sortOrder: p.orden.direccion,
								},
								perfil?.id ?? '',
								p.signal,
								{
									pagina: p.pagina - 1,
									limite: p.tamanoPagina,
									...(p.version ? { revision: p.version } : {}),
									exportar: true,
								},
							);
							return {
								filas: resultado.filas,
								total: resultado.total,
								version: resultado.revision,
							};
						}}
					/>
					<Stack
						direction={{ xs: 'column', sm: 'row' }}
						spacing={2}
						useFlexGap
						sx={{ flexWrap: 'wrap' }}
					>
						<TextField
							type="date"
							label="Desde"
							value={c.desde}
							slotProps={{ inputLabel: { shrink: true } }}
							onChange={(e) => setC({ ...c, desde: e.target.value, page: 1 })}
						/>
						<TextField
							type="date"
							label="Hasta"
							value={c.hasta}
							slotProps={{ inputLabel: { shrink: true } }}
							onChange={(e) => setC({ ...c, hasta: e.target.value, page: 1 })}
						/>
						<TextField
							select
							label="Estado del envío"
							value={c.estado}
							onChange={(e) =>
								setC({ ...c, estado: e.target.value as CriteriosHistorial['estado'], page: 1 })
							}
							sx={{ minWidth: 180 }}
						>
							<MenuItem value="todos">Todos</MenuItem>
							<MenuItem value="procesando">Procesando</MenuItem>
							<MenuItem value="enviado">Aceptado por proveedor</MenuItem>
							<MenuItem value="fallido">Con fallos</MenuItem>
						</TextField>
						<Button onClick={() => setC({ ...criteriosHistorialIniciales })}>
							Limpiar filtros
						</Button>
						<Button
							onClick={() => {
								startRef.current = Date.now();
								void q.refetch();
							}}
							disabled={q.isFetching || Boolean(issue)}
						>
							Actualizar
						</Button>
					</Stack>
					<Alert severity="info">
						La aceptación del proveedor y la entrega son resultados diferentes. Abrí el detalle para
						consultar el estado individual; un envío con pendientes o aceptación incierta conserva
						su seguimiento.
					</Alert>
					{issue && <Alert severity="warning">{issue}</Alert>}
					{q.isLoading && <Typography>Consultando envíos…</Typography>}
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
								<Table aria-label="Historial de comunicaciones" sx={{ minWidth: 750 }}>
									<TableHead>
										<TableRow>
											{(
												[
													['fecha_envio', 'Fecha y hora'],
													['asunto', 'Asunto'],
													['autor', 'Origen y autor'],
													['destinatarios_count', 'Destinatarios'],
													['estado', 'Estado'],
												] as const
											).map(([key, label]) => (
												<TableCell key={key}>
													{key === 'autor' ? (
														label
													) : (
														<TableSortLabel
															active={c.sortBy === key}
															direction={c.sortOrder}
															onClick={() => sort(key)}
														>
															{label}
														</TableSortLabel>
													)}
												</TableCell>
											))}
											<TableCell>Acciones</TableCell>
										</TableRow>
									</TableHead>
									<TableBody>
										{q.data.envios.map((envio) => (
											<TableRow key={envio.id}>
												<TableCell>{fechaCorreo(envio.fecha_envio)}</TableCell>
												<TableCell>
													<Typography sx={{ fontWeight: 600 }}>{envio.asunto}</Typography>
													<Typography variant="caption">
														{envio.tipo === 'general'
															? 'Comunicación general'
															: envio.tipo === 'deuda'
																? 'Aviso de deuda'
																: 'Notificación de operación'}
													</Typography>
												</TableCell>
												<TableCell>
													{envio.origen === 'automatico'
														? 'Automático'
														: (envio.autor_nombre ?? 'Autor no disponible')}
												</TableCell>
												<TableCell>{envio.destinatarios_count}</TableCell>
												<TableCell>
													<Chip
														size="small"
														color={
															envio.estado === 'fallido'
																? 'error'
																: envio.estado === 'procesando'
																	? 'warning'
																	: 'success'
														}
														label={
															envio.estado === 'enviado'
																? 'Aceptado por proveedor'
																: envio.estado === 'fallido'
																	? 'Con fallos'
																	: 'Procesando'
														}
													/>
												</TableCell>
												<TableCell>
													<Button component={Link} to={`/comunicaciones/${envio.id}`}>
														Ver detalle
													</Button>
												</TableCell>
											</TableRow>
										))}
										{q.data.envios.length === 0 && (
											<TableRow>
												<TableCell colSpan={6}>
													No se encontraron correos que coincidan con la búsqueda.
												</TableCell>
											</TableRow>
										)}
									</TableBody>
								</Table>
							</TableContainer>
							<TablePagination
								component="div"
								count={q.data.total}
								page={Math.min(c.page - 1, Math.max(0, Math.ceil(q.data.total / c.pageSize) - 1))}
								rowsPerPage={c.pageSize}
								rowsPerPageOptions={[20, 50, 100]}
								labelRowsPerPage="Filas por página"
								labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
								onPageChange={(_, page) => setC({ ...c, page: page + 1 })}
								onRowsPerPageChange={(e) =>
									setC({ ...c, page: 1, pageSize: Number(e.target.value) as 20 | 50 | 100 })
								}
							/>
						</>
					)}
				</Stack>
			</Paper>
		</>
	);
}
