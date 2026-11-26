import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import SportsSoccerOutlinedIcon from '@mui/icons-material/SportsSoccerOutlined';
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
import { EmptyState, InfoTooltip, PageHeader } from '#shared/ui';

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
			<Alert
				severity="info"
				action={
					<Button size="small" color="inherit" component={Link} to="/socios">
						Volver al padrón
					</Button>
				}
			>
				No se encontró el socio solicitado.
			</Alert>
		);
	}
	return <SocioView key={`${cacheScope}:${socioId}`} socioId={socioId} />;
}

function Datum({
	label,
	value,
	tabular = false,
}: {
	label: string;
	value: string | number | null;
	tabular?: boolean;
}) {
	return (
		<Box sx={{ minWidth: 0 }}>
			<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
				{label}
			</Typography>
			<Typography
				variant="body2"
				sx={{
					mt: 0.25,
					fontWeight: 500,
					overflowWrap: 'anywhere',
					fontVariantNumeric: tabular ? 'tabular-nums' : undefined,
				}}
			>
				{value || 'No informado'}
			</Typography>
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
			<Stack
				direction="row"
				spacing={1.5}
				role="status"
				sx={{ py: 6, justifyContent: 'center', alignItems: 'center' }}
			>
				<CircularProgress size={22} />
				<Typography variant="body2" color="text.secondary">
					Cargando ficha del socio…
				</Typography>
			</Stack>
		);
	}
	if (detail.isError) {
		return (
			<Alert
				severity="error"
				action={
					<Button size="small" color="inherit" onClick={() => void detail.refetch()}>
						Reintentar
					</Button>
				}
			>
				No pudimos cargar la ficha. Revisá la conexión e intentá nuevamente.
			</Alert>
		);
	}
	if (!detail.data) {
		return (
			<Alert
				severity="info"
				action={
					<Button size="small" color="inherit" component={Link} to="/socios">
						Volver al padrón
					</Button>
				}
			>
				No se encontró el socio solicitado.
			</Alert>
		);
	}

	const socio = detail.data;
	const active = historial.data?.filter((item) => item.estado === 'activa') ?? [];
	const past = historial.data?.filter((item) => item.estado !== 'activa') ?? [];

	return (
		<Stack spacing={3}>
			<PageHeader
				back={
					<Button component={Link} to="/socios" size="small" startIcon={<ArrowBackIcon />}>
						Volver al padrón
					</Button>
				}
				title={`${socio.apellido}, ${socio.nombre}`}
				subtitle={`Socio #${socio.numero_socio} · DNI ${socio.dni}`}
				actions={
					<>
						<Chip
							size="small"
							label={socio.estado === 'activo' ? 'Activo' : 'Inactivo'}
							color={socio.estado === 'activo' ? 'success' : 'default'}
						/>
						<Button
							variant="outlined"
							size="small"
							startIcon={<PaymentsOutlinedIcon />}
							component={Link}
							to={`/pagos?socioId=${socio.id}`}
						>
							Cuotas y cobros
						</Button>
						<Button
							variant="outlined"
							size="small"
							startIcon={<EditOutlinedIcon />}
							onClick={() => setEditOpen(true)}
						>
							Editar datos
						</Button>
						<Button
							variant={socio.estado === 'activo' ? 'outlined' : 'contained'}
							size="small"
							color={socio.estado === 'activo' ? 'error' : 'primary'}
							onClick={() => setStatusOpen(true)}
						>
							{socio.estado === 'activo' ? 'Dar de baja' : 'Reactivar socio'}
						</Button>
					</>
				}
			/>

			<Box
				sx={{
					display: 'grid',
					gridTemplateColumns: { xs: '1fr', md: 'minmax(280px, 1fr) 1.5fr' },
					gap: 3,
				}}
			>
				<UpdateSocioPhoto socioId={socio.id} onUpdated={refresh} />
				<Paper
					variant="outlined"
					sx={{
						p: 2.5,
						borderLeftWidth: 4,
						borderLeftColor: resumen.data
							? resumen.data.esMoroso
								? 'error.main'
								: resumen.data.deudaPendiente > 0
									? 'warning.main'
									: 'success.main'
							: 'divider',
					}}
				>
					<Stack
						direction="row"
						spacing={1}
						sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}
					>
						<Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
							<Typography component="h2" variant="h6">
								Estado de cuotas
							</Typography>
							<InfoTooltip
								label="Relación entre deuda y estado del socio"
								title="El estado de pago es independiente del estado administrativo: dar de baja a un socio conserva su historial y sus cuotas pendientes."
							/>
						</Stack>
						{resumen.data && (
							<Chip
								size="small"
								label={resumen.data.esMoroso ? 'Moroso' : 'Al día'}
								color={resumen.data.esMoroso ? 'error' : 'success'}
							/>
						)}
					</Stack>

					{resumen.isPending ? (
						<Stack direction="row" spacing={1.25} sx={{ py: 2, alignItems: 'center' }}>
							<CircularProgress size={18} aria-label="Consultando cuotas" />
							<Typography variant="body2" color="text.secondary">
								Consultando resumen de cuotas…
							</Typography>
						</Stack>
					) : resumen.isError || !resumen.data ? (
						<Alert
							severity="warning"
							action={
								<Button size="small" color="inherit" onClick={() => void resumen.refetch()}>
									Reintentar
								</Button>
							}
						>
							No pudimos consultar el resumen de cuotas.
						</Alert>
					) : (
						<Stack spacing={1.25}>
							<Box>
								<Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
									Deuda pendiente total
								</Typography>
								<Typography
									variant="h4"
									sx={{
										fontWeight: 800,
										fontVariantNumeric: 'tabular-nums',
										color: resumen.data.esMoroso
											? 'error.main'
											: resumen.data.deudaPendiente > 0
												? 'warning.main'
												: 'text.primary',
									}}
								>
									{currency.format(resumen.data.deudaPendiente)}
								</Typography>
							</Box>
							<Typography variant="body2" color="text.secondary">
								{resumen.data.cuotasPendientes === 0
									? 'Sin cuotas pendientes de pago.'
									: `${resumen.data.cuotasPendientes} ${resumen.data.cuotasPendientes === 1 ? 'cuota pendiente' : 'cuotas pendientes'}${!resumen.data.esMoroso ? ' (todas dentro del plazo).' : '.'}`}
							</Typography>
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
					sx={{ px: 1 }}
				>
					<Tab label="Datos del socio" id="socio-tab-datos" aria-controls="socio-panel-datos" />
					<Tab
						label={`Historial deportivo (${active.length})`}
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
						spacing={2}
						sx={{ mb: 2, justifyContent: 'space-between', alignItems: { sm: 'center' } }}
					>
						<Typography component="h2" variant="h6">
							Actividades vigentes
						</Typography>
						<Button
							variant="contained"
							size="small"
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
						<Stack direction="row" spacing={1.25} sx={{ py: 3, alignItems: 'center' }}>
							<CircularProgress size={18} aria-label="Cargando historial" />
							<Typography variant="body2" color="text.secondary">
								Cargando historial deportivo…
							</Typography>
						</Stack>
					) : historial.isError ? (
						<Alert
							severity="error"
							action={
								<Button size="small" color="inherit" onClick={() => void historial.refetch()}>
									Reintentar
								</Button>
							}
						>
							No pudimos consultar las inscripciones.
						</Alert>
					) : (
						<Stack spacing={3}>
							<HistorialTable rows={active} active onDesvincular={setDesvincular} />
							<Box>
								<Typography component="h2" variant="h6" sx={{ mb: 1.5 }}>
									Inscripciones anteriores
								</Typography>
								<HistorialTable rows={past} onDesvincular={setDesvincular} />
							</Box>
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
	const showFechaBaja = socio.estado === 'inactivo' || Boolean(socio.fecha_baja);
	return (
		<Stack spacing={3}>
			<Box>
				<Typography component="h2" variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
					Datos personales
				</Typography>
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
						gap: 2.5,
					}}
				>
					<Datum label="Nombre" value={socio.nombre} />
					<Datum label="Apellido" value={socio.apellido} />
					<Datum
						label="Fecha de nacimiento"
						value={`${date(socio.fecha_nacimiento)}${age === null ? '' : ` · ${age} años`}`}
						tabular
					/>
					<Datum label="Fecha de ingreso" value={date(socio.fecha_alta)} tabular />
					{showFechaBaja && <Datum label="Fecha de baja" value={date(socio.fecha_baja)} tabular />}
				</Box>
			</Box>

			<Divider />

			<Box>
				<Typography component="h2" variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
					Contacto y preferencias
				</Typography>
				<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 }}>
					<Datum label="Correo electrónico" value={socio.email} />
					<Datum label="Teléfono" value={socio.telefono} tabular />
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
					<Alert severity="warning" sx={{ mt: 2 }}>
						El correo está marcado como inválido. Al corregirlo podrá volver a recibir envíos; la
						preferencia de comunicaciones se mantiene por separado.
					</Alert>
				)}
			</Box>

			<Divider />

			<Box>
				<Typography component="h2" variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
					Contacto de emergencia
				</Typography>
				<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 }}>
					<Datum label="Nombre del contacto" value={socio.contacto_emergencia_nombre} />
					<Datum label="Teléfono del contacto" value={socio.contacto_emergencia_telefono} tabular />
				</Box>
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
			<EmptyState
				icon={<SportsSoccerOutlinedIcon />}
				title={active ? 'Sin inscripciones activas' : 'Sin inscripciones anteriores'}
				description={
					active
						? 'Usá «Inscribir a actividad» para asociar a este socio a un deporte y categoría.'
						: 'Cuando el socio se desvincule de alguna actividad, su registro histórico aparecerá acá.'
				}
			/>
		);
	}
	return (
		<TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
			<Table
				size="small"
				aria-label={active ? 'Inscripciones activas' : 'Historial de inscripciones'}
			>
				<TableHead>
					<TableRow>
						<TableCell>Deporte / categoría</TableCell>
						<TableCell>Alta</TableCell>
						{!active && <TableCell>Baja</TableCell>}
						<TableCell>Estado</TableCell>
						{active && <TableCell align="right">Acciones</TableCell>}
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
							<TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
								{date(row.fecha_alta)}
							</TableCell>
							{!active && (
								<TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
									{date(row.fecha_baja)}
								</TableCell>
							)}
							<TableCell>
								<Chip
									size="small"
									color={active ? 'success' : 'default'}
									label={active ? 'Activa' : 'Cerrada'}
								/>
							</TableCell>
							{active && (
								<TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
									<Button
										size="small"
										variant="outlined"
										color="error"
										onClick={() => onDesvincular(row)}
									>
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
