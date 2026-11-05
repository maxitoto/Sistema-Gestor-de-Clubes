import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import {
	Alert,
	Box,
	Button,
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
import {
	getHistorialJobsCuotas,
	getPeriodoCuotasActual,
	type PeriodoCuotas,
} from '#entities/job-cuotas';
import { useAuth } from '#entities/session';
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

export function GenerarCuotasPanel() {
	const { cacheScope, profileStatus, perfil, user, isSigningOut } = useAuth();
	if (profileStatus !== 'ready' || perfil?.rol !== 'admin' || !user || isSigningOut) {
		return null;
	}
	return <PanelGeneracion key={cacheScope} cacheScope={cacheScope} usuarioId={user.id} />;
}

function PanelGeneracion({ cacheScope, usuarioId }: { cacheScope: string; usuarioId: string }) {
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
	return (
		<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, mt: 3 }}>
			<Stack
				direction={{ xs: 'column', sm: 'row' }}
				spacing={2}
				sx={{ justifyContent: 'space-between', mb: 2 }}
			>
				<Box>
					<Typography component="h2" variant="h6">
						Cuotas mensuales
					</Typography>
					<Typography variant="body2" color="text.secondary">
						Generación del mes actual y consulta de corridas anteriores.
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
				>
					Generar cuotas del mes
				</Button>
			</Stack>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				El período y los importes se determinan con la fecha del club. Las cuotas ya emitidas se
				conservan.
			</Typography>
			{periodo.isError && (
				<Alert
					severity="error"
					action={<Button onClick={() => void periodo.refetch()}>Reintentar</Button>}
					sx={{ mb: 2 }}
				>
					No pudimos consultar el período actual.
				</Alert>
			)}
			{generation.feedback && (
				<Alert severity={generation.requiresCheck ? 'warning' : 'info'} sx={{ mb: 2 }}>
					{generation.feedback}
				</Alert>
			)}
			{generation.requiresCheck && (
				<Button
					variant="outlined"
					disabled={generation.isPending || !enabled}
					onClick={() => void generation.consultarResultado()}
					sx={{ mb: 2 }}
				>
					Consultar resultado guardado
				</Button>
			)}
			{generation.isPending && (
				<Stack direction="row" spacing={1} role="status" sx={{ alignItems: 'center', my: 2 }}>
					<CircularProgress size={20} />
					<Typography variant="body2">Consultando y verificando la generación…</Typography>
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
					sx={{ mb: 2 }}
				>
					<Typography sx={{ fontWeight: 700 }}>
						{result.job.estado === 'fallido'
							? 'La generación no se completó'
							: result.origen === 'generado'
								? 'Generación confirmada'
								: result.origen === 'recuperado'
									? 'Corrida guardada consultada'
									: 'El mes ya fue generado'}
					</Typography>
					Período {periodoTexto({ mes: result.job.periodo_mes, anio: result.job.periodo_anio })}.{' '}
					{result.job.estado === 'fallido'
						? 'No se confirmó un lote parcial. Podés revisar el historial y volver a intentar manualmente.'
						: `${result.job.cuotas_generadas} cuotas generadas y ${result.job.cuotas_omitidas} ya existentes conservadas en esa corrida.`}
				</Alert>
			)}
			<Typography component="h3" variant="subtitle2" sx={{ mb: 1 }}>
				Últimas corridas
			</Typography>
			{history.isPending && <CircularProgress size={22} aria-label="Cargando corridas de cuotas" />}
			{history.isError && (
				<Alert
					severity="error"
					action={<Button onClick={() => void history.refetch()}>Reintentar</Button>}
					sx={{ mb: 2 }}
				>
					No pudimos cargar el historial de generación.
				</Alert>
			)}
			{!history.isPending && !history.isError && history.data?.length === 0 && (
				<Alert severity="info">Todavía no hay corridas registradas.</Alert>
			)}
			{!!history.data?.length && (
				<TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
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
									<TableCell>
										{periodoTexto({ mes: job.periodo_mes, anio: job.periodo_anio })}
									</TableCell>
									<TableCell>
										{job.estado === 'exitoso'
											? 'Completada'
											: job.estado === 'fallido'
												? 'Fallida'
												: 'En proceso'}
									</TableCell>
									<TableCell align="right">{job.cuotas_generadas}</TableCell>
									<TableCell align="right">{job.cuotas_omitidas}</TableCell>
									<TableCell>{fechaTexto(job.fecha_inicio)}</TableCell>
									<TableCell>{fechaTexto(job.fecha_fin)}</TableCell>
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
					<Typography>
						Se generarán las cuotas que correspondan a socios activos con inscripciones vigentes.
						Las cuotas existentes no se duplican ni se recalculan.
					</Typography>
					<Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
						El resultado se consulta antes de confirmar la operación. Esta acción no registra
						cobros.
					</Typography>
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
		</Paper>
	);
}
