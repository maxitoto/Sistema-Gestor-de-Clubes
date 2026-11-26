import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import {
	Alert,
	Box,
	Button,
	Chip,
	CircularProgress,
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
	TableRow,
	Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { EstadoNotificacionCorreo } from '#entities/comunicacion';
import {
	getHistorialJobsCuotas,
	getPeriodoCuotasActual,
	type PeriodoCuotas,
} from '#entities/job-cuotas';
import { useAuth } from '#entities/session';
import { EmptyState } from '#shared/ui';
import { useGenerarCuotas } from '../model/useGenerarCuotas';

const periodoTexto = (periodo: PeriodoCuotas) =>
	`${String(periodo.mes).padStart(2, '0')}/${periodo.anio}`;
const fechaTexto = (value: string | null) =>
	value
		? new Intl.DateTimeFormat('es-AR', {
				timeZone: 'America/Argentina/Buenos_Aires',
				dateStyle: 'short',
				timeStyle: 'short',
			}).format(new Date(value))
		: 'En proceso';

export function GenerarCuotasPanel({ embedded = false }: { embedded?: boolean } = {}) {
	const { cacheScope, profileStatus, perfil, user, isSigningOut } = useAuth();
	if (profileStatus !== 'ready' || perfil?.rol !== 'admin' || !user || isSigningOut) {
		return null;
	}
	return (
		<PanelGeneracion
			key={cacheScope}
			cacheScope={cacheScope}
			usuarioId={user.id}
			embedded={embedded}
		/>
	);
}

function PanelGeneracion({
	cacheScope,
	usuarioId,
	embedded,
}: {
	cacheScope: string;
	usuarioId: string;
	embedded: boolean;
}) {
	const { profileStatus, perfil, isSigningOut } = useAuth();
	const enabled = profileStatus === 'ready' && perfil?.rol === 'admin' && !isSigningOut;
	const [confirmar, setConfirmar] = useState<PeriodoCuotas | null>(null);
	const periodo = useQuery({
		queryKey: ['job-cuotas-periodo', cacheScope],
		queryFn: ({ signal }) => getPeriodoCuotasActual(signal),
		enabled,
		retry: 1,
		staleTime: 0,
	});
	const history = useQuery({
		queryKey: ['job-cuotas', cacheScope],
		queryFn: ({ signal }) => getHistorialJobsCuotas(signal),
		enabled,
		retry: 1,
	});
	const generation = useGenerarCuotas({ cacheScope, enabled, usuarioId });
	const result = generation.result;

	const abrirConfirmacion = async () => {
		const actual = await periodo.refetch();
		if (actual.data && !actual.error) {
			setConfirmar(actual.data);
		}
	};

	const content = (
		<Stack spacing={2}>
			<Stack
				direction={{ xs: 'column', sm: 'row' }}
				spacing={2}
				sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
			>
				<Box>
					{!embedded && (
						<Typography component="h2" variant="h6">
							Cuotas mensuales
						</Typography>
					)}
					<Typography variant="body2" color="text.secondary">
						La generación manual siempre toma el mes actual del club. Las cuotas ya emitidas se
						conservan sin duplicarse.
					</Typography>
				</Box>
				<Button
					variant="contained"
					startIcon={<CalendarMonthOutlinedIcon />}
					disabled={
						!enabled ||
						generation.isPending ||
						generation.requiresCheck ||
						periodo.isFetching ||
						!periodo.data ||
						periodo.isError
					}
					onClick={() => void abrirConfirmacion()}
					sx={{ flexShrink: 0, alignSelf: { xs: 'flex-start', sm: 'center' } }}
				>
					Generar cuotas del mes
				</Button>
			</Stack>

			{periodo.isError && (
				<Alert
					severity="error"
					action={
						<Button size="small" color="inherit" onClick={() => void periodo.refetch()}>
							Reintentar
						</Button>
					}
				>
					No pudimos consultar el período actual del club.
				</Alert>
			)}

			{generation.feedback && (
				<Alert
					severity={generation.requiresCheck ? 'warning' : 'info'}
					action={
						generation.requiresCheck ? (
							<Button
								size="small"
								color="inherit"
								disabled={generation.isPending || !enabled}
								onClick={() => void generation.consultarResultado()}
							>
								Consultar resultado
							</Button>
						) : undefined
					}
				>
					{generation.feedback}
				</Alert>
			)}

			{generation.isPending && (
				<Stack direction="row" spacing={1.25} role="status" sx={{ alignItems: 'center' }}>
					<CircularProgress size={18} />
					<Typography variant="body2" color="text.secondary">
						Verificando y ejecutando la generación…
					</Typography>
				</Stack>
			)}

			{result && (
				<Alert
					severity={
						result.job.estado === 'fallido'
							? 'error'
							: result.origen === 'generado'
								? 'success'
								: 'info'
					}
				>
					<Typography variant="body2" sx={{ fontWeight: 700 }}>
						{result.job.estado === 'fallido'
							? 'La generación no se completó'
							: result.origen === 'generado'
								? 'Generación confirmada'
								: result.origen === 'recuperado'
									? 'Resultado de la generación recuperado'
									: 'El mes ya fue generado'}
					</Typography>
					<Typography variant="body2" sx={{ mt: 0.25 }}>
						Período {periodoTexto({ mes: result.job.periodo_mes, anio: result.job.periodo_anio })}.{' '}
						{result.job.estado === 'fallido'
							? 'No se confirmó un lote parcial. Podés revisar el historial y volver a intentar.'
							: `${result.job.cuotas_generadas} cuotas generadas y ${result.job.cuotas_omitidas} ya existentes conservadas.`}
					</Typography>
				</Alert>
			)}

			{result?.job.estado === 'exitoso' && (
				<EstadoNotificacionCorreo
					operation={{ jobId: result.job.id }}
					actorId={usuarioId}
					cacheScope={cacheScope}
					enabled={enabled}
				/>
			)}

			<Typography component="h3" variant="subtitle2" sx={{ fontWeight: 700, pt: 0.5 }}>
				Últimas generaciones
			</Typography>

			{history.isPending && (
				<Stack direction="row" spacing={1.25} sx={{ py: 2, alignItems: 'center' }}>
					<CircularProgress size={18} aria-label="Cargando historial de generaciones" />
					<Typography variant="body2" color="text.secondary">
						Cargando historial…
					</Typography>
				</Stack>
			)}

			{history.isError && (
				<Alert
					severity="error"
					action={
						<Button size="small" color="inherit" onClick={() => void history.refetch()}>
							Reintentar
						</Button>
					}
				>
					No pudimos cargar el historial de generaciones.
				</Alert>
			)}

			{!history.isPending && !history.isError && history.data?.length === 0 && (
				<EmptyState
					title="Todavía no hay generaciones registradas"
					description="Cuando ejecutes la emisión mensual de cuotas, cada resultado quedará registrado acá."
				/>
			)}

			{!!history.data?.length && (
				<TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
					<Table size="small" aria-label="Historial de generación mensual de cuotas">
						<TableHead>
							<TableRow>
								<TableCell>Período</TableCell>
								<TableCell>Estado</TableCell>
								<TableCell align="right">Generadas</TableCell>
								<TableCell align="right">Ya existentes</TableCell>
								<TableCell>Inicio</TableCell>
								<TableCell>Finalización</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{history.data.map((job) => (
								<TableRow key={job.id}>
									<TableCell sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
										{periodoTexto({ mes: job.periodo_mes, anio: job.periodo_anio })}
									</TableCell>
									<TableCell>
										<Chip
											size="small"
											color={
												job.estado === 'exitoso'
													? 'success'
													: job.estado === 'fallido'
														? 'error'
														: 'warning'
											}
											label={
												job.estado === 'exitoso'
													? 'Completada'
													: job.estado === 'fallido'
														? 'Fallida'
														: 'En proceso'
											}
										/>
									</TableCell>
									<TableCell align="right">{job.cuotas_generadas}</TableCell>
									<TableCell align="right">{job.cuotas_omitidas}</TableCell>
									<TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
										{fechaTexto(job.fecha_inicio)}
									</TableCell>
									<TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
										{fechaTexto(job.fecha_fin)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</TableContainer>
			)}

			<Dialog
				open={Boolean(confirmar)}
				onClose={() => {
					if (!generation.isPending) {
						setConfirmar(null);
					}
				}}
				maxWidth="sm"
				aria-labelledby="confirmar-cuotas-titulo"
			>
				<DialogTitle id="confirmar-cuotas-titulo">
					Generar cuotas de {confirmar ? periodoTexto(confirmar) : ''}
				</DialogTitle>
				<DialogContent dividers>
					<Stack spacing={1.5}>
						<Typography variant="body2">
							Se generarán las cuotas correspondientes a los socios activos con inscripciones
							vigentes. Las cuotas que ya existan en este período no se duplican ni se recalculan.
						</Typography>
						<Typography variant="caption" color="text.secondary">
							El sistema verifica el estado previo antes de confirmar. Esta acción solo emite cuotas
							pendientes y no registra cobros.
						</Typography>
					</Stack>
				</DialogContent>
				<DialogActions>
					<Button
						variant="outlined"
						disabled={generation.isPending}
						onClick={() => setConfirmar(null)}
					>
						Cancelar
					</Button>
					<Button
						variant="contained"
						disabled={generation.isPending || !enabled || !confirmar}
						onClick={() => {
							if (confirmar) {
								const expected = confirmar;
								setConfirmar(null);
								void generation.generar(expected);
							}
						}}
					>
						Confirmar generación
					</Button>
				</DialogActions>
			</Dialog>
		</Stack>
	);

	if (embedded) {
		return content;
	}

	return (
		<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
			{content}
		</Paper>
	);
}
