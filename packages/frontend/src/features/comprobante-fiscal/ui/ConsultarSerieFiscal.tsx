import {
	Alert,
	Button,
	Chip,
	CircularProgress,
	Divider,
	MenuItem,
	Stack,
	TextField,
	Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { consultarSerieFiscal, type ResultadoConsultaSerieFiscal } from '#entities/comprobante';
import { useAuth } from '#entities/session';

const tipos = [
	{ codigo: 1, nombre: 'Factura A' },
	{ codigo: 6, nombre: 'Factura B' },
	{ codigo: 11, nombre: 'Factura C' },
];

export function ConsultarSerieFiscal() {
	const { cacheScope } = useAuth();
	return <ConsultaSerie key={cacheScope} />;
}

function ConsultaSerie() {
	const { perfil, profileStatus, isSigningOut, cacheScope } = useAuth();
	const actorId = perfil?.id ?? '';
	const enabled = profileStatus === 'ready' && !isSigningOut && perfil?.rol === 'admin';
	const [tipo, setTipo] = useState('');
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<ResultadoConsultaSerieFiscal | null>(null);
	const [error, setError] = useState<string | null>(null);
	const activeRef = useRef(true),
		accessRef = useRef({ enabled, actorId, cacheScope }),
		lockRef = useRef(false),
		generationRef = useRef(0),
		abortRef = useRef<AbortController | null>(null);
	accessRef.current = { enabled, actorId, cacheScope };

	useEffect(() => {
		activeRef.current = true;
		return () => {
			activeRef.current = false;
			generationRef.current++;
			abortRef.current?.abort();
		};
	}, []);

	useEffect(() => {
		if (enabled) {
			return;
		}
		generationRef.current++;
		abortRef.current?.abort();
		lockRef.current = false;
		setBusy(false);
		setResult(null);
		setError(null);
	}, [enabled]);

	if (!enabled) {
		return null;
	}

	const run = async () => {
		const selected = Number(tipo);
		if (!enabled || lockRef.current || !tipos.some((value) => value.codigo === selected)) {
			return;
		}
		const generation = ++generationRef.current;
		const scope = cacheScope,
			actor = actorId;
		const current = () =>
			activeRef.current &&
			accessRef.current.enabled &&
			accessRef.current.actorId === actor &&
			accessRef.current.cacheScope === scope &&
			generationRef.current === generation;
		lockRef.current = true;
		setBusy(true);
		setResult(null);
		setError(null);
		const controller = new AbortController();
		abortRef.current = controller;
		try {
			const response = await consultarSerieFiscal(selected, actor, controller.signal);
			if (current()) {
				setResult(response);
			}
		} catch (error) {
			if (current()) {
				setError(
					error instanceof Error ? error.message : 'No pudimos consultar el último comprobante.',
				);
			}
		} finally {
			if (current()) {
				lockRef.current = false;
				setBusy(false);
			}
		}
	};

	const nombre = tipos.find((value) => value.codigo === result?.tipoComprobante)?.nombre;

	return (
		<Stack spacing={1.75} sx={{ pt: 1 }}>
			<Divider />
			<Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
				<Chip size="small" color="primary" label="Paso 3" />
				<Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
					Consulta de serie (sin emisión)
				</Typography>
			</Stack>
			<Typography variant="body2" color="text.secondary">
				Consultá el último número autorizado para tu punto de venta. Esta prueba solo lee el estado
				en ARCA: no emite comprobantes ni reserva números.
			</Typography>
			<TextField
				size="small"
				select
				label="Tipo de comprobante"
				value={tipo}
				disabled={!enabled || busy}
				helperText="Se usa solo para esta consulta y no cambia la configuración fiscal."
				onChange={(event) => {
					generationRef.current++;
					abortRef.current?.abort();
					setTipo(event.target.value);
					setResult(null);
					setError(null);
				}}
			>
				<MenuItem value="">Elegí un tipo de comprobante</MenuItem>
				{tipos.map((value) => (
					<MenuItem key={value.codigo} value={String(value.codigo)}>
						{value.nombre} (código {value.codigo})
					</MenuItem>
				))}
			</TextField>
			<Button
				variant="outlined"
				size="small"
				startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
				disabled={busy || !tipo}
				onClick={() => void run()}
				sx={{ alignSelf: 'flex-start' }}
			>
				{busy ? 'Consultando ARCA…' : 'Consultar último comprobante'}
			</Button>
			{error && <Alert severity="error">{error}</Alert>}
			{result &&
				(result.resultado === 'obtenido' ? (
					<Alert severity="success">
						<Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
							<strong>{nombre}</strong> · Punto de venta{' '}
							<strong>{String(result.puntoVentaConfigurado).padStart(5, '0')}</strong> · Último
							número autorizado: <strong>{result.ultimoAutorizado}</strong>.
						</Typography>
						<Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>
							Consulta informativa: no se emitió ninguna factura ni se solicitó CAE.
						</Typography>
					</Alert>
				) : (
					<Alert severity="warning">
						<Typography variant="body2">
							No pudimos confirmar la serie de {nombre} en el punto de venta{' '}
							{String(result.puntoVentaConfigurado).padStart(5, '0')}.
						</Typography>
						<Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
							{result.codigos.map((value) => `${value.codigo}: ${value.mensaje}`).join(' ')}
						</Typography>
					</Alert>
				))}
		</Stack>
	);
}
