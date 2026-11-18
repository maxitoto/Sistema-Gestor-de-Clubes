import {
	Alert,
	Button,
	Chip,
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
import { useEffect, useRef, useState } from 'react';
import { diagnosticarFiscal, type ResultadoDiagnosticoFiscal } from '#entities/comprobante';
import { useAuth } from '#entities/session';
import { ConsultarSerieFiscal } from './ConsultarSerieFiscal';

export function DiagnosticoFiscal() {
	const { perfil, profileStatus, isSigningOut } = useAuth();
	const enabled = profileStatus === 'ready' && !isSigningOut && perfil?.rol === 'admin';
	const [busy, setBusy] = useState(false),
		[result, setResult] = useState<ResultadoDiagnosticoFiscal | null>(null),
		[error, setError] = useState<string | null>(null);
	const activeRef = useRef(true),
		accessRef = useRef(enabled),
		lockRef = useRef(false),
		abortRef = useRef<AbortController | null>(null);
	accessRef.current = enabled;
	useEffect(() => {
		activeRef.current = true;
		return () => {
			activeRef.current = false;
			abortRef.current?.abort();
		};
	}, []);
	if (!enabled) {
		return null;
	}
	const current = () => activeRef.current && accessRef.current;
	const run = async () => {
		if (!enabled || lockRef.current) {
			return;
		}
		lockRef.current = true;
		setBusy(true);
		setResult(null);
		setError(null);
		const controller = new AbortController();
		abortRef.current = controller;
		try {
			const response = await diagnosticarFiscal(perfil.id, controller.signal);
			if (current()) {
				setResult(response);
			}
		} catch (error) {
			if (current()) {
				setError(error instanceof Error ? error.message : 'No se pudo comprobar el acceso.');
			}
		} finally {
			if (current()) {
				lockRef.current = false;
				setBusy(false);
			}
		}
	};
	return (
		<Stack spacing={1.5}>
			<Typography component="h3" variant="h6">
				Listado de puntos de venta de homologación
			</Typography>
			<Typography variant="body2">
				Esta consulta auxiliar muestra los puntos de venta informados por ARCA. Si el listado no
				devuelve datos en homologación, podés consultar la serie por separado debajo. Ninguna de
				estas comprobaciones emite comprobantes ni modifica la configuración.
			</Typography>
			<Button variant="outlined" disabled={busy} onClick={() => void run()}>
				{busy ? 'Comprobando…' : 'Consultar listado de puntos de venta'}
			</Button>
			{error && <Alert severity="error">{error}</Alert>}
			{result && (
				<Stack spacing={1.5}>
					{result.ausenciaDatos === '602' ? (
						<Alert severity="info">
							ARCA respondió al listado con el código 602: no hay puntos de venta para mostrar.
							Podés consultar la serie debajo para comprobar el punto y tipo elegidos. Este aviso no
							es un rechazo de factura; esta consulta no solicitó CAE.
						</Alert>
					) : (
						<Alert severity={result.puntoVentaDisponible ? 'success' : 'warning'}>
							{result.puntoVentaDisponible
								? `El listado informa que el punto de venta ${String(result.puntoVentaConfigurado).padStart(5, '0')} es de tipo CAE y no tiene bloqueo ni baja.`
								: `El listado no confirma disponibilidad del punto de venta configurado ${String(result.puntoVentaConfigurado).padStart(5, '0')}; consultá la serie por separado para comprobar esa consulta.`}
						</Alert>
					)}
					{result.puntosVenta.length === 0 ? (
						!result.ausenciaDatos && (
							<Alert severity="info">
								ARCA no informó puntos de venta para la CUIT consultada en homologación.
							</Alert>
						)
					) : (
						<TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
							<Table size="small" aria-label="Puntos de venta de homologación">
								<TableHead>
									<TableRow>
										<TableCell>Punto de venta</TableCell>
										<TableCell>Emisión</TableCell>
										<TableCell>Bloqueado</TableCell>
										<TableCell>Fecha de baja</TableCell>
										<TableCell>En esta aplicación</TableCell>
									</TableRow>
								</TableHead>
								<TableBody>
									{result.puntosVenta.map((punto) => (
										<TableRow key={punto.numero}>
											<TableCell>{String(punto.numero).padStart(5, '0')}</TableCell>
											<TableCell>{punto.emisionTipo}</TableCell>
											<TableCell>{punto.bloqueado ? 'Sí' : 'No'}</TableCell>
											<TableCell>
												{punto.bajaFecha ? punto.bajaFecha.split('-').reverse().join('/') : '—'}
											</TableCell>
											<TableCell>
												{punto.numero === result.puntoVentaConfigurado ? (
													<Chip size="small" label="Configurado" />
												) : (
													'—'
												)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</TableContainer>
					)}
					<Typography variant="body2" color="text.secondary">
						Para cambiar el punto configurado, completá Punto de venta en Datos institucionales y
						guardá los datos. Esta consulta no selecciona uno automáticamente.
					</Typography>
				</Stack>
			)}
			<ConsultarSerieFiscal />
		</Stack>
	);
}
