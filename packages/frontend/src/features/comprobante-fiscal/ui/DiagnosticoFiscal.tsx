import {
	Alert,
	Button,
	Chip,
	CircularProgress,
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
import { formatIsoDateArg } from '#shared/lib/datePresets';
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
				setError(error instanceof Error ? error.message : 'No se pudo comprobar la conexión.');
			}
		} finally {
			if (current()) {
				lockRef.current = false;
				setBusy(false);
			}
		}
	};

	return (
		<Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
			<Stack spacing={2}>
				<Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
					<Chip size="small" color="primary" label="Paso 2" />
					<Typography component="h2" variant="h6">
						Puntos de venta habilitados
					</Typography>
				</Stack>

				<Typography variant="body2" color="text.secondary">
					Comprobá qué puntos de venta informa ARCA para tu CUIT en homologación. Estas pruebas no
					emiten facturas ni modifican la configuración del club.
				</Typography>

				<Button
					variant="outlined"
					size="small"
					startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
					disabled={busy}
					onClick={() => void run()}
					sx={{ alignSelf: 'flex-start' }}
				>
					{busy ? 'Consultando ARCA…' : 'Consultar puntos de venta'}
				</Button>

				{error && <Alert severity="error">{error}</Alert>}

				{result && (
					<Stack spacing={1.5}>
						{result.ausenciaDatos === '602' ? (
							<Alert severity="info">
								ARCA no devolvió puntos de venta en este listado (código 602), algo habitual en el
								ambiente de pruebas. Usá el <strong>Paso 3</strong> debajo para comprobar tu punto
								de venta configurado.
							</Alert>
						) : (
							<Alert severity={result.puntoVentaDisponible ? 'success' : 'warning'}>
								{result.puntoVentaDisponible
									? `El punto de venta ${String(result.puntoVentaConfigurado).padStart(5, '0')} figura habilitado para CAE, sin bloqueos ni baja.`
									: `El listado no confirma el punto de venta configurado (${String(result.puntoVentaConfigurado).padStart(5, '0')}). Comprobalo en el Paso 3 debajo.`}
							</Alert>
						)}

						{result.puntosVenta.length === 0 ? (
							!result.ausenciaDatos && (
								<Alert severity="info">
									ARCA no informó puntos de venta para la CUIT consultada en homologación.
								</Alert>
							)
						) : (
							<TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
								<Table size="small" aria-label="Puntos de venta de homologación">
									<TableHead>
										<TableRow>
											<TableCell>Punto de venta</TableCell>
											<TableCell>Emisión</TableCell>
											<TableCell>Bloqueado</TableCell>
											<TableCell>Fecha de baja</TableCell>
											<TableCell>Estado local</TableCell>
										</TableRow>
									</TableHead>
									<TableBody>
										{result.puntosVenta.map((punto) => (
											<TableRow key={punto.numero}>
												<TableCell sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
													{String(punto.numero).padStart(5, '0')}
												</TableCell>
												<TableCell>{punto.emisionTipo}</TableCell>
												<TableCell>{punto.bloqueado ? 'Sí' : 'No'}</TableCell>
												<TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>
													{formatIsoDateArg(punto.bajaFecha)}
												</TableCell>
												<TableCell>
													{punto.numero === result.puntoVentaConfigurado ? (
														<Chip size="small" color="info" label="Configurado" />
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

						<Typography variant="caption" color="text.secondary">
							Para cambiar el punto de venta usado por el club, modificalo en «Datos
							institucionales» y guardá los cambios.
						</Typography>
					</Stack>
				)}

				<ConsultarSerieFiscal />
			</Stack>
		</Paper>
	);
}
