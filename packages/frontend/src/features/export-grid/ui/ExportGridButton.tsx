import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { Alert, Button, LinearProgress, Stack, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '#entities/session';
import { InfoTooltip } from '#shared/ui';
import type { ConfiguracionExportacion, FormatoExportacion } from '../model/exportarGrilla';
import { descargarExportacion, exportarGrilla } from '../model/exportarGrilla';

interface Props<Fila, Filtro extends object> extends ConfiguracionExportacion<Fila, Filtro> {
	disabled?: boolean;
}
export function ExportGridButton<Fila, Filtro extends object>(props: Props<Fila, Filtro>) {
	const { cacheScope, profileStatus, isSigningOut } = useAuth();
	const [ocupado, setOcupado] = useState(false),
		[mensaje, setMensaje] = useState<string | null>(null),
		[error, setError] = useState(false),
		[progreso, setProgreso] = useState<{
			recuperadas: number;
			total: number;
			fase: 'recuperando' | 'generando';
		} | null>(null);
	const controladorRef = useRef<AbortController | null>(null),
		vivoRef = useRef(true),
		sesionRef = useRef<string | null>(null),
		lockRef = useRef(false),
		previousScopeRef = useRef(cacheScope);
	sesionRef.current = profileStatus === 'ready' && !isSigningOut ? cacheScope : null;
	useEffect(() => {
		vivoRef.current = true;
		return () => {
			vivoRef.current = false;
			controladorRef.current?.abort();
		};
	}, []);
	useEffect(() => {
		if (previousScopeRef.current !== cacheScope || profileStatus !== 'ready' || isSigningOut) {
			controladorRef.current?.abort();
			setMensaje(null);
		}
		previousScopeRef.current = cacheScope;
	}, [cacheScope, profileStatus, isSigningOut]);
	const iniciar = async (formato: FormatoExportacion) => {
		if (lockRef.current || props.disabled || !sesionRef.current) {
			return;
		}
		lockRef.current = true;
		const c = new AbortController();
		controladorRef.current = c;
		setOcupado(true);
		setMensaje(null);
		setError(false);
		setProgreso(null);
		try {
			const archivo = await exportarGrilla({
				...props,
				formato,
				signal: c.signal,
				alcanceSesion: cacheScope,
				sesionActual: () => sesionRef.current,
				onProgreso: (p) => {
					if (vivoRef.current) {
						setProgreso(p);
					}
				},
			});
			if (vivoRef.current && !c.signal.aborted && sesionRef.current === cacheScope) {
				descargarExportacion(archivo);
				setMensaje(`Archivo preparado con ${archivo.total} filas.`);
			}
		} catch (e) {
			if (vivoRef.current) {
				const cancelado = e instanceof Error && e.name === 'AbortError';
				setError(!cancelado);
				setMensaje(
					cancelado
						? 'Exportación cancelada. No se descargó un archivo.'
						: e instanceof Error
							? e.message
							: 'No se pudo exportar. Volvé a intentarlo.',
				);
			}
		} finally {
			lockRef.current = false;
			if (vivoRef.current) {
				setOcupado(false);
				setProgreso(null);
			}
		}
	};
	return (
		<Stack spacing={1} sx={{ minWidth: 0 }}>
			<Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }} spacing={1}>
				<Button
					variant="outlined"
					size="small"
					startIcon={<FileDownloadOutlinedIcon fontSize="small" />}
					disabled={ocupado || props.disabled || !sesionRef.current}
					onClick={() => void iniciar('csv')}
				>
					Exportar CSV
				</Button>
				<Button
					variant="outlined"
					size="small"
					startIcon={<FileDownloadOutlinedIcon fontSize="small" />}
					disabled={ocupado || props.disabled || !sesionRef.current}
					onClick={() => void iniciar('xlsx')}
				>
					Exportar XLSX
				</Button>
				<InfoTooltip
					label="Cómo funciona la exportación"
					title="Exporta todas las páginas del listado respetando los filtros y el orden actuales."
				/>
				{ocupado && (
					<Button size="small" color="inherit" onClick={() => controladorRef.current?.abort()}>
						Cancelar
					</Button>
				)}
			</Stack>
			{ocupado && (
				<>
					<LinearProgress
						aria-label="Preparando exportación"
						variant={progreso?.total ? 'determinate' : 'indeterminate'}
						value={
							progreso?.total ? Math.min(100, (progreso.recuperadas * 100) / progreso.total) : 0
						}
					/>
					<Typography role="status" variant="caption">
						{progreso?.fase === 'generando'
							? 'Generando archivo…'
							: `Recuperando ${progreso?.recuperadas ?? 0} de ${progreso?.total ?? '…'} filas…`}
					</Typography>
				</>
			)}
			{mensaje && (
				<Alert severity={error ? 'error' : 'info'} onClose={() => setMensaje(null)}>
					{mensaje}
				</Alert>
			)}
		</Stack>
	);
}
