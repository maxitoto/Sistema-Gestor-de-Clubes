import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import {
	Alert,
	Box,
	Button,
	Chip,
	CircularProgress,
	Divider,
	Paper,
	Stack,
	Tab,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Tabs,
	Typography,
} from '@mui/material';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { type InscripcionHistorial, useHistorialInscripciones } from '#entities/inscripcion';
import { useAuth } from '#entities/session';
import { edadSocio, type SocioDetalle, useResumenSocio, useSocio } from '#entities/socio';
import { ChangeSocioStatusDialog } from '#features/change-socio-status';
import { DesvincularSocioDialog } from '#features/desvincular-socio';
import { EditSocioForm } from '#features/edit-socio';
import { InscribirSocioDialog } from '#features/inscribir-socio';
import { UpdateSocioPhoto } from '#features/update-socio-photo';

const currency = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const date = (value: string | null) => {
	if (!value) {
		return '—';
	}
	return value.includes('T')
		? new Intl.DateTimeFormat('es-AR', {
				timeZone: 'America/Argentina/Buenos_Aires',
				day: '2-digit',
				month: '2-digit',
				year: 'numeric',
			}).format(new Date(value))
		: value.split('-').reverse().join('/');
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function SocioPage() {
	const { socioId = '' } = useParams();
	const { cacheScope } = useAuth();
	if (!uuid.test(socioId)) {
		return (
			<Alert severity="info">
				No se encontró el socio solicitado. <Link to="/socios">Volver al padrón</Link>
			</Alert>
		);
	}
	return <SocioView key={`${cacheScope}:${socioId}`} socioId={socioId} />;
}

function Datum({ label, value }: { label: string; value: string | number | null }) {
	return (
		<Box>
			<Typography variant="caption" color="text.secondary">
				{label}
			</Typography>
			<Typography sx={{ overflowWrap: 'anywhere' }}>{value || 'No informado'}</Typography>
		</Box>
	);
}

function SocioView({ socioId }: { socioId: string }) {
	const { cacheScope, profileStatus } = useAuth();
	const enabled = profileStatus === 'ready';
	const detail = useSocio(socioId, cacheScope, enabled);
	const resumen = useResumenSocio(socioId, cacheScope, enabled && Boolean(detail.data));
	const historial = useHistorialInscripciones(socioId, cacheScope, enabled && Boolean(detail.data));
	const [tab, setTab] = useState(0);
	const [editOpen, setEditOpen] = useState(false);
	const [statusOpen, setStatusOpen] = useState(false);
	const [inscribirOpen, setInscribirOpen] = useState(false);
	const [desvincular, setDesvincular] = useState<InscripcionHistorial | null>(null);
	const refresh = () => {
		void detail.refetch();
		void resumen.refetch();
		void historial.refetch();
	};
	if (!enabled || detail.isPending) {
		return (
			<Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
				<CircularProgress size={24} />
				<Typography>Cargando ficha del socio…</Typography>
			</Box>
		);
	}
	if (detail.isError) {
		return (
			<Alert
				severity="error"
				action={<Button onClick={() => void detail.refetch()}>Reintentar</Button>}
			>
				No pudimos cargar la ficha. Revisá la conexión e intentá nuevamente.
			</Alert>
		);
	}
	if (!detail.data) {
		return (
			<Alert severity="info">
				No se encontró el socio solicitado. <Link to="/socios">Volver al padrón</Link>
			</Alert>
		);
	}
	const socio = detail.data;
	const active = historial.data?.filter((item) => item.estado === 'activa') ?? [];
	const past = historial.data?.filter((item) => item.estado !== 'activa') ?? [];
	return (
		<Stack spacing={3}>
			<Button
				component={Link}
				to="/socios"
				startIcon={<ArrowBackIcon />}
				sx={{ alignSelf: 'flex-start' }}
			>
				Volver al padrón
			</Button>
			<Stack
				direction={{ xs: 'column', sm: 'row' }}
				sx={{ gap: 2, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
			>
				<Box>
					<Typography component="h1" variant="h5">
						{socio.apellido}, {socio.nombre}
					</Typography>
					<Typography color="text.secondary">
						Socio n.º {socio.numero_socio} · DNI {socio.dni}
					</Typography>
				</Box>
				<Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
					<Chip
						label={socio.estado === 'activo' ? 'Activo' : 'Inactivo'}
						color={socio.estado === 'activo' ? 'success' : 'default'}
						variant="outlined"
					/>
					<Button
						variant="outlined"
						startIcon={<EditOutlinedIcon />}
						onClick={() => setEditOpen(true)}
					>
						Editar datos
					</Button>
					<Button component={Link} to={`/pagos?socioId=${socio.id}`} variant="outlined">
						Ver cuotas y cobros
					</Button>
					<Button
						color={socio.estado === 'activo' ? 'error' : 'primary'}
						onClick={() => setStatusOpen(true)}
					>
						{socio.estado === 'activo' ? 'Dar de baja' : 'Reactivar socio'}
					</Button>
				</Stack>
			</Stack>
			<Box
				sx={{
					display: 'grid',
					gridTemplateColumns: { xs: '1fr', md: 'minmax(260px, 1fr) 2fr' },
					gap: 3,
				}}
			>
				<Paper variant="outlined" sx={{ p: 3 }}>
					<UpdateSocioPhoto socioId={socio.id} onUpdated={refresh} />
				</Paper>
				<Paper variant="outlined" sx={{ p: 3 }}>
					<Typography component="h2" variant="h6" sx={{ mb: 2 }}>
						Estado de cuotas
					</Typography>
					{resumen.isPending ? (
						<CircularProgress size={22} aria-label="Consultando cuotas" />
					) : resumen.isError || !resumen.data ? (
						<Alert
							severity="warning"
							action={<Button onClick={() => void resumen.refetch()}>Reintentar</Button>}
						>
							No pudimos consultar el resumen de cuotas.
						</Alert>
					) : (
						<Stack spacing={1.5}>
							<Chip
								sx={{ alignSelf: 'flex-start' }}
								label={resumen.data.esMoroso ? 'Moroso' : 'Al día'}
								color={resumen.data.esMoroso ? 'error' : 'success'}
								variant="outlined"
							/>
							<Typography>
								Deuda pendiente total:{' '}
								<strong>{currency.format(resumen.data.deudaPendiente)}</strong>
							</Typography>
							<Typography variant="body2" color="text.secondary">
								{resumen.data.cuotasPendientes}{' '}
								{resumen.data.cuotasPendientes === 1 ? 'cuota pendiente' : 'cuotas pendientes'}. El
								estado de pago es independiente del estado administrativo del socio.
							</Typography>
							{!resumen.data.esMoroso && (
								<Typography variant="body2" color="text.secondary">
									No registra cuotas en mora. Puede tener cuotas pendientes dentro del plazo.
								</Typography>
							)}
						</Stack>
					)}
				</Paper>
			</Box>
			<Paper variant="outlined">
				<Tabs
					value={tab}
					onChange={(_event, value: number) => setTab(value)}
					aria-label="Secciones de la ficha"
					variant="scrollable"
					allowScrollButtonsMobile
				>
					<Tab label="Datos del socio" id="socio-tab-datos" aria-controls="socio-panel-datos" />
					<Tab
						label="Historial deportivo"
						id="socio-tab-deportes"
						aria-controls="socio-panel-deportes"
					/>
				</Tabs>
				<Divider />
				<Box
					role="tabpanel"
					id="socio-panel-datos"
					aria-labelledby="socio-tab-datos"
					hidden={tab !== 0}
					sx={{ p: { xs: 2, sm: 3 } }}
				>
					<DatosSocio socio={socio} />
				</Box>
				<Box
					role="tabpanel"
					id="socio-panel-deportes"
					aria-labelledby="socio-tab-deportes"
					hidden={tab !== 1}
					sx={{ p: { xs: 2, sm: 3 } }}
				>
					<Stack
						direction={{ xs: 'column', sm: 'row' }}
						sx={{ mb: 2, gap: 2, justifyContent: 'space-between', alignItems: { sm: 'center' } }}
					>
						<Typography component="h2" variant="h6">
							Actividades actuales
						</Typography>
						<Button
							variant="contained"
							disabled={socio.estado !== 'activo'}
							onClick={() => setInscribirOpen(true)}
						>
							Inscribir a actividad
						</Button>
					</Stack>
					{socio.estado !== 'activo' && (
						<Alert severity="info" sx={{ mb: 2 }}>
							Para inscribirlo nuevamente, primero reactivá al socio. Su historial se conserva.
						</Alert>
					)}
					{historial.isPending ? (
						<CircularProgress size={22} aria-label="Cargando historial" />
					) : historial.isError ? (
						<Alert
							severity="error"
							action={<Button onClick={() => void historial.refetch()}>Reintentar</Button>}
						>
							No pudimos consultar las inscripciones.
						</Alert>
					) : (
						<Stack spacing={3}>
							<HistorialTable rows={active} active onDesvincular={setDesvincular} />
							<Typography component="h2" variant="h6">
								Inscripciones históricas
							</Typography>
							<HistorialTable rows={past} onDesvincular={setDesvincular} />
						</Stack>
					)}
				</Box>
			</Paper>
			{editOpen && (
				<EditSocioForm open socio={socio} onClose={() => setEditOpen(false)} onSaved={refresh} />
			)}
			{statusOpen && (
				<ChangeSocioStatusDialog
					open
					socio={socio}
					deudaPendiente={resumen.data?.deudaPendiente ?? null}
					onClose={() => setStatusOpen(false)}
					onSaved={refresh}
				/>
			)}
			{desvincular && (
				<DesvincularSocioDialog
					open
					inscripcion={desvincular}
					onClose={() => setDesvincular(null)}
					onSaved={refresh}
				/>
			)}
			<InscribirSocioDialog
				open={inscribirOpen}
				socio={socio}
				onClose={() => {
					setInscribirOpen(false);
					refresh();
				}}
			/>
		</Stack>
	);
}

function DatosSocio({ socio }: { socio: SocioDetalle }) {
	const age = edadSocio(socio.fecha_nacimiento);
	return (
		<Stack spacing={3}>
			<Typography component="h2" variant="h6">
				Datos personales
			</Typography>
			<Box
				sx={{
					display: 'grid',
					gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' },
					gap: 3,
				}}
			>
				<Datum label="Nombre" value={socio.nombre} />
				<Datum label="Apellido" value={socio.apellido} />
				<Datum
					label="Fecha de nacimiento"
					value={`${date(socio.fecha_nacimiento)}${age === null ? '' : ` · ${age} años`}`}
				/>
				<Datum label="Fecha de ingreso" value={date(socio.fecha_alta)} />
				<Datum label="Fecha de baja" value={date(socio.fecha_baja)} />
			</Box>
			<Divider />
			<Typography component="h2" variant="h6">
				Contacto y preferencias
			</Typography>
			<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3 }}>
				<Datum label="Correo electrónico" value={socio.email} />
				<Datum label="Teléfono" value={socio.telefono} />
				<Datum label="Domicilio" value={socio.direccion} />
				<Datum
					label="Comunicaciones"
					value={
						socio.acepta_comunicaciones
							? 'Acepta comunicaciones del club'
							: 'No acepta comunicaciones del club'
					}
				/>
			</Box>
			{socio.email_invalido && (
				<Alert severity="warning">
					El correo está marcado como inválido. Corregirlo permitirá volver a utilizarlo; la
					preferencia de comunicaciones se gestiona por separado.
				</Alert>
			)}
			<Divider />
			<Typography component="h2" variant="h6">
				Contacto de emergencia
			</Typography>
			<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3 }}>
				<Datum label="Nombre del contacto" value={socio.contacto_emergencia_nombre} />
				<Datum label="Teléfono del contacto" value={socio.contacto_emergencia_telefono} />
			</Box>
			{socio.dni_corregido_at && (
				<Alert severity="info">
					Documento corregido el {date(socio.dni_corregido_at)}. Documento anterior:{' '}
					{socio.dni_anterior}. La matrícula del socio se conservó.
				</Alert>
			)}
		</Stack>
	);
}

function HistorialTable({
	rows,
	active = false,
	onDesvincular,
}: {
	rows: InscripcionHistorial[];
	active?: boolean;
	onDesvincular: (row: InscripcionHistorial) => void;
}) {
	if (!rows.length) {
		return (
			<Alert severity="info">
				{active ? 'No tiene inscripciones activas.' : 'Todavía no tiene inscripciones cerradas.'}
			</Alert>
		);
	}
	return (
		<TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
			<Table
				size="small"
				aria-label={active ? 'Inscripciones activas' : 'Historial de inscripciones'}
			>
				<TableHead>
					<TableRow>
						<TableCell>Deporte / categoría</TableCell>
						<TableCell>Alta</TableCell>
						<TableCell>Baja</TableCell>
						<TableCell>Estado</TableCell>
						{active && <TableCell>Acciones</TableCell>}
					</TableRow>
				</TableHead>
				<TableBody>
					{rows.map((row) => (
						<TableRow key={row.id}>
							<TableCell>
								<Typography variant="body2" sx={{ fontWeight: 600 }}>
									{row.categoria?.deporte?.nombre}
								</Typography>
								<Typography variant="caption" color="text.secondary">
									{row.categoria?.nombre}
								</Typography>
							</TableCell>
							<TableCell>{date(row.fecha_alta)}</TableCell>
							<TableCell>{date(row.fecha_baja)}</TableCell>
							<TableCell>
								<Chip
									size="small"
									variant="outlined"
									color={active ? 'success' : 'default'}
									label={active ? 'Activa' : 'Cerrada'}
								/>
							</TableCell>
							{active && (
								<TableCell>
									<Button color="error" onClick={() => onDesvincular(row)}>
										Desvincular
									</Button>
								</TableCell>
							)}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</TableContainer>
	);
}
