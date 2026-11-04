import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import SportsRoundedIcon from '@mui/icons-material/SportsRounded';
import {
	Alert,
	Box,
	Button,
	ButtonBase,
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
import { useState } from 'react';
import { useCategorias } from '#entities/categoria';
import { useDeportes } from '#entities/deporte';
import { useAuth } from '#entities/session';
import { CreateCategoriaDialog } from '#features/create-categoria';
import { CreateDeporteDialog } from '#features/create-deporte';

const formatArancel = (value: number) =>
	new Intl.NumberFormat('es-AR', {
		style: 'currency',
		currency: 'ARS',
		minimumFractionDigits: 2,
	}).format(value);

export function DeportesPanel() {
	const { cacheScope } = useAuth();
	return <Catalogo key={cacheScope} />;
}

function Catalogo() {
	const { cacheScope, profileStatus, perfil, isSigningOut } = useAuth();
	const enabled = profileStatus === 'ready' && perfil?.rol === 'admin' && !isSigningOut;
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [createDeporte, setCreateDeporte] = useState(false);
	const [createCategoria, setCreateCategoria] = useState(false);
	const [success, setSuccess] = useState<string | null>(null);
	const deportes = useDeportes({ cacheScope, enabled });
	const selected =
		enabled && !deportes.isFetching && !deportes.isError
			? deportes.data?.find((deporte) => deporte.id === selectedId)
			: undefined;
	const categorias = useCategorias(selected?.id ?? null, {
		cacheScope,
		enabled: enabled && Boolean(selected),
	});
	const loading = !enabled || deportes.isPending || deportes.isFetching;
	return (
		<Stack spacing={3}>
			<Box>
				<Typography component="h1" variant="h5" sx={{ fontWeight: 700 }}>
					Estructura deportiva
				</Typography>
				<Typography color="text.secondary" sx={{ mt: 0.5 }}>
					Administrá los deportes, sus categorías y aranceles mensuales.
				</Typography>
			</Box>
			{success && (
				<Alert severity="success" onClose={() => setSuccess(null)}>
					{success}
				</Alert>
			)}
			<Box
				sx={{
					display: 'grid',
					gridTemplateColumns: { xs: '1fr', lg: '300px minmax(0, 1fr)' },
					gap: 2,
					alignItems: 'start',
				}}
			>
				<Paper variant="outlined" sx={{ p: 2 }}>
					<Stack
						direction="row"
						sx={{ mb: 2, alignItems: 'center', justifyContent: 'space-between', gap: 1 }}
					>
						<Typography component="h2" variant="subtitle1" sx={{ fontWeight: 700 }}>
							Deportes
							{!loading && !deportes.isError && deportes.data ? ` (${deportes.data.length})` : ''}
						</Typography>
						<Button
							variant="contained"
							size="small"
							startIcon={<AddRoundedIcon />}
							disabled={!enabled}
							onClick={() => setCreateDeporte(true)}
						>
							Nuevo deporte
						</Button>
					</Stack>
					{loading && (
						<Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 3 }}>
							<CircularProgress size={22} aria-label="Cargando deportes" />
							<Typography color="text.secondary" variant="body2">
								Cargando deportes…
							</Typography>
						</Box>
					)}
					{!loading && deportes.isError && (
						<Alert
							severity="error"
							action={<Button onClick={() => void deportes.refetch()}>Reintentar</Button>}
						>
							No pudimos cargar los deportes.
						</Alert>
					)}
					{!loading &&
						!deportes.isError &&
						deportes.data &&
						(deportes.data.length === 0 ? (
							<Alert severity="info">
								Todavía no hay deportes. Creá el primero para agregar categorías.
							</Alert>
						) : (
							<Stack
								spacing={1}
								component="ul"
								aria-label="Deportes"
								sx={{ m: 0, p: 0, listStyle: 'none' }}
							>
								{deportes.data.map((deporte) => (
									<Box component="li" key={deporte.id}>
										<ButtonBase
											aria-label={`Ver categorías de ${deporte.nombre}`}
											aria-pressed={selectedId === deporte.id}
											onClick={() => {
												setSelectedId(deporte.id);
												setCreateCategoria(false);
											}}
											sx={{
												width: '100%',
												p: 1.5,
												border: 1,
												borderRadius: 1.5,
												borderColor: selectedId === deporte.id ? 'primary.main' : 'divider',
												bgcolor: selectedId === deporte.id ? 'action.selected' : 'background.paper',
												color: selectedId === deporte.id ? 'primary.main' : 'text.primary',
												textAlign: 'left',
												justifyContent: 'space-between',
												gap: 1,
												'&:hover': { bgcolor: 'action.hover' },
												'&.Mui-focusVisible': {
													outline: '2px solid',
													outlineColor: 'primary.main',
													outlineOffset: 2,
												},
											}}
										>
											<Box sx={{ minWidth: 0 }}>
												<Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
													<SportsRoundedIcon fontSize="small" />
													<Typography
														variant="body2"
														sx={{ overflowWrap: 'anywhere', fontWeight: 700 }}
													>
														{deporte.nombre}
													</Typography>
												</Stack>
												{deporte.descripcion && (
													<Typography
														variant="caption"
														color="text.secondary"
														sx={{ display: 'block', mt: 0.5, overflowWrap: 'anywhere' }}
													>
														{deporte.descripcion}
													</Typography>
												)}
												<Chip
													size="small"
													label={deporte.estado === 'activo' ? 'Activo' : 'Inactivo'}
													color={deporte.estado === 'activo' ? 'success' : 'default'}
													variant="outlined"
													sx={{ mt: 1, height: 22 }}
												/>
											</Box>
											<ArrowForwardRoundedIcon sx={{ fontSize: 18, flexShrink: 0 }} />
										</ButtonBase>
									</Box>
								))}
							</Stack>
						))}
				</Paper>
				<Paper variant="outlined" sx={{ minWidth: 0, minHeight: 300 }}>
					{selected ? (
						<>
							<Box sx={{ p: 2.5, borderBottom: 1, borderColor: 'divider' }}>
								<Stack
									direction={{ xs: 'column', sm: 'row' }}
									sx={{
										alignItems: { xs: 'flex-start', sm: 'center' },
										justifyContent: 'space-between',
										gap: 2,
									}}
								>
									<Box>
										<Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
											Categorías de {selected.nombre}
										</Typography>
										<Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
											Aranceles mensuales y rangos de edad orientativos.
										</Typography>
									</Box>
									<Button
										variant="contained"
										startIcon={<AddRoundedIcon />}
										disabled={!enabled || selected.estado !== 'activo'}
										onClick={() => setCreateCategoria(true)}
										sx={{ flexShrink: 0 }}
									>
										Nueva categoría
									</Button>
								</Stack>
							</Box>
							{selected.estado !== 'activo' && (
								<Alert severity="info" sx={{ m: 2 }}>
									Este deporte está inactivo y no ofrece opciones de inscripción.
								</Alert>
							)}
							{(categorias.isPending || categorias.isFetching) && (
								<Box role="status" sx={{ p: 3 }}>
									<CircularProgress size={24} aria-label="Cargando categorías" />
								</Box>
							)}
							{!categorias.isFetching && categorias.isError && (
								<Alert
									severity="error"
									sx={{ m: 2 }}
									action={<Button onClick={() => void categorias.refetch()}>Reintentar</Button>}
								>
									No pudimos cargar las categorías.
								</Alert>
							)}
							{!categorias.isFetching &&
								!categorias.isError &&
								categorias.data &&
								(categorias.data.length === 0 ? (
									<Box sx={{ p: 3 }}>
										<Alert severity="info">Este deporte todavía no tiene categorías.</Alert>
									</Box>
								) : (
									<TableContainer>
										<Table
											size="small"
											aria-label={`Categorías de ${selected.nombre}`}
											sx={{ minWidth: 540 }}
										>
											<TableHead>
												<TableRow>
													<TableCell>Categoría</TableCell>
													<TableCell align="right">Arancel mensual</TableCell>
													<TableCell>Rango de edad</TableCell>
													<TableCell>Estado</TableCell>
												</TableRow>
											</TableHead>
											<TableBody>
												{categorias.data.map((categoria) => (
													<TableRow
														key={categoria.id}
														sx={{ opacity: categoria.estado === 'activo' ? 1 : 0.7 }}
													>
														<TableCell sx={{ fontWeight: 600 }}>{categoria.nombre}</TableCell>
														<TableCell
															align="right"
															sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
														>
															{formatArancel(categoria.arancel_mensual)}
														</TableCell>
														<TableCell sx={{ whiteSpace: 'nowrap' }}>
															{categoria.edad_min === null
																? 'Sin límite'
																: `${categoria.edad_min} a ${categoria.edad_max} años`}
														</TableCell>
														<TableCell>
															<Chip
																size="small"
																label={categoria.estado === 'activo' ? 'Activa' : 'Inactiva'}
																color={categoria.estado === 'activo' ? 'success' : 'default'}
																variant="outlined"
															/>
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</TableContainer>
								))}
							{createCategoria && (
								<CreateCategoriaDialog
									key={selected.id}
									open
									deporteId={selected.id}
									deporteNombre={selected.nombre}
									onClose={() => setCreateCategoria(false)}
									onCreated={(categoria) =>
										setSuccess(
											`Categoría ${categoria.nombre} creada y disponible para inscripción.`,
										)
									}
								/>
							)}
						</>
					) : (
						<Stack
							spacing={1.5}
							sx={{
								p: 4,
								minHeight: 300,
								textAlign: 'center',
								alignItems: 'center',
								justifyContent: 'center',
							}}
						>
							<Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover', color: 'primary.main' }}>
								<SportsRoundedIcon sx={{ display: 'block', fontSize: 32 }} />
							</Box>
							<Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
								Categorías y aranceles
							</Typography>
							<Typography variant="body2" color="text.secondary" sx={{ maxWidth: 320 }}>
								Seleccioná un deporte para consultar sus categorías y agregar nuevas opciones de
								inscripción.
							</Typography>
						</Stack>
					)}
				</Paper>
			</Box>
			{createDeporte && (
				<CreateDeporteDialog
					open
					onClose={() => setCreateDeporte(false)}
					onCreated={(deporte) => {
						setSelectedId(deporte.id);
						setSuccess(`Deporte ${deporte.nombre} creado.`);
					}}
				/>
			)}
		</Stack>
	);
}
