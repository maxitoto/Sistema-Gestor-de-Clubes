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
import { useEffect, useState } from 'react';
import { type Categoria, useCategorias } from '#entities/categoria';
import { type Deporte, useDeportes } from '#entities/deporte';
import { useAuth } from '#entities/session';
import { CreateCategoriaDialog } from '#features/create-categoria';
import { CreateDeporteDialog } from '#features/create-deporte';
import { type CatalogoBajaTarget, DeactivateCatalogoDialog } from '#features/deactivate-catalogo';
import { EditCategoriaDialog } from '#features/edit-categoria';
import { EditDeporteDialog } from '#features/edit-deporte';
import { EmptyState, PageHeader } from '#shared/ui';

const formatArancel = (value: number) =>
	new Intl.NumberFormat('es-AR', {
		style: 'currency',
		currency: 'ARS',
		minimumFractionDigits: 2,
	}).format(value);

const formatEdadRango = (min: number | null, max: number | null) => {
	if (min === null || max === null) {
		return 'Sin límite';
	}
	if (min === max) {
		return `${min} ${min === 1 ? 'año' : 'años'}`;
	}
	return `${min} a ${max} años`;
};

export function DeportesPanel() {
	const { cacheScope } = useAuth();
	return <Catalogo key={cacheScope} />;
}

function Catalogo() {
	const { cacheScope, profileStatus, perfil, isSigningOut } = useAuth();
	const enabled =
		profileStatus === 'ready' &&
		perfil?.rol === 'admin' &&
		perfil.estado === 'activo' &&
		!isSigningOut;
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [createDeporte, setCreateDeporte] = useState(false);
	const [createCategoria, setCreateCategoria] = useState(false);
	const [success, setSuccess] = useState<string | null>(null);
	const [editDeporte, setEditDeporte] = useState<Deporte | null>(null);
	const [editCategoria, setEditCategoria] = useState<{
		registro: Categoria;
		deporteNombre: string;
	} | null>(null);
	const [bajaTarget, setBajaTarget] = useState<CatalogoBajaTarget | null>(null);
	const deportes = useDeportes({ cacheScope, enabled });

	useEffect(() => {
		if (!selectedId && deportes.data?.length && deportes.data[0]) {
			setSelectedId(deportes.data[0].id);
		}
	}, [selectedId, deportes.data]);

	const selected =
		enabled && !deportes.isError
			? deportes.data?.find((deporte) => deporte.id === selectedId)
			: undefined;
	const categorias = useCategorias(selected?.id ?? null, {
		cacheScope,
		enabled: enabled && Boolean(selected),
	});
	const loading = !enabled || deportes.isPending;

	const reloadCatalogo = () => {
		void deportes.refetch();
		if (selected) {
			void categorias.refetch();
		}
	};

	return (
		<Stack spacing={3}>
			<PageHeader
				title="Deportes y categorías"
				subtitle="Administrá las disciplinas del club, sus rangos de edad orientativos y aranceles mensuales."
				actions={
					<Button
						variant="contained"
						startIcon={<AddRoundedIcon />}
						disabled={!enabled}
						onClick={() => setCreateDeporte(true)}
					>
						Nuevo deporte
					</Button>
				}
			/>

			{success && (
				<Alert severity="success" onClose={() => setSuccess(null)}>
					{success}
				</Alert>
			)}

			<Box
				sx={{
					display: 'grid',
					gridTemplateColumns: { xs: '1fr', lg: '310px minmax(0, 1fr)' },
					gap: 2.5,
					alignItems: 'start',
				}}
			>
				<Paper variant="outlined" sx={{ p: 2 }}>
					<Stack
						direction="row"
						sx={{ mb: 2, alignItems: 'center', justifyContent: 'space-between', gap: 1 }}
					>
						<Typography component="h2" variant="subtitle1" sx={{ fontWeight: 700 }}>
							Disciplinas
							{!loading && !deportes.isError && deportes.data ? ` (${deportes.data.length})` : ''}
						</Typography>
					</Stack>
					{loading && (
						<Stack direction="row" spacing={1.5} role="status" sx={{ py: 3, alignItems: 'center' }}>
							<CircularProgress size={20} aria-label="Cargando deportes" />
							<Typography color="text.secondary" variant="body2">
								Cargando deportes…
							</Typography>
						</Stack>
					)}
					{!loading && deportes.isError && (
						<Alert
							severity="error"
							action={
								<Button size="small" color="inherit" onClick={() => void deportes.refetch()}>
									Reintentar
								</Button>
							}
						>
							No pudimos cargar los deportes.
						</Alert>
					)}
					{!loading &&
						!deportes.isError &&
						deportes.data &&
						(deportes.data.length === 0 ? (
							<EmptyState
								icon={<SportsRoundedIcon />}
								title="Todavía no hay deportes"
								description="Creá la primera disciplina para cargar categorías y aranceles."
								action={
									<Button
										variant="contained"
										size="small"
										startIcon={<AddRoundedIcon />}
										onClick={() => setCreateDeporte(true)}
									>
										Nuevo deporte
									</Button>
								}
							/>
						) : (
							<Stack
								spacing={1}
								component="ul"
								aria-label="Deportes"
								sx={{ m: 0, p: 0, listStyle: 'none' }}
							>
								{deportes.data.map((deporte) => {
									const isSelected = selectedId === deporte.id;
									return (
										<Box component="li" key={deporte.id}>
											<ButtonBase
												aria-label={`Ver categorías de ${deporte.nombre}`}
												aria-pressed={isSelected}
												onClick={() => {
													setSelectedId(deporte.id);
													setCreateCategoria(false);
												}}
												sx={{
													width: '100%',
													p: 1.5,
													border: 1,
													borderRadius: 1.5,
													borderColor: isSelected ? 'primary.main' : 'divider',
													bgcolor: isSelected ? 'action.selected' : 'background.paper',
													color: isSelected ? 'primary.main' : 'text.primary',
													textAlign: 'left',
													justifyContent: 'space-between',
													gap: 1,
													opacity: deporte.estado === 'activo' ? 1 : 0.72,
													transition: 'background-color 140ms ease, border-color 140ms ease',
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
													<Box sx={{ mt: 1 }}>
														<Chip
															size="small"
															label={deporte.estado === 'activo' ? 'Activo' : 'Inactivo'}
															color={deporte.estado === 'activo' ? 'success' : 'default'}
														/>
													</Box>
												</Box>
												<ArrowForwardRoundedIcon sx={{ fontSize: 18, flexShrink: 0 }} />
											</ButtonBase>
										</Box>
									);
								})}
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
										<Stack
											direction="row"
											spacing={1}
											useFlexGap
											sx={{ alignItems: 'center', flexWrap: 'wrap' }}
										>
											<Typography component="h2" variant="h6">
												Categorías de {selected.nombre}
											</Typography>
											<Chip
												size="small"
												label={selected.estado === 'activo' ? 'Activo' : 'Inactivo'}
												color={selected.estado === 'activo' ? 'success' : 'default'}
											/>
										</Stack>
										<Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
											Aranceles mensuales y rangos de edad orientativos.
										</Typography>
										<Stack
											direction="row"
											spacing={1}
											useFlexGap
											sx={{ mt: 1.5, flexWrap: 'wrap' }}
										>
											<Button
												size="small"
												variant="outlined"
												onClick={() => setEditDeporte(selected)}
												disabled={!enabled}
											>
												Editar deporte
											</Button>
											{selected.estado === 'activo' && (
												<Button
													size="small"
													color="error"
													onClick={() => setBajaTarget({ tipo: 'deporte', registro: selected })}
													disabled={!enabled}
												>
													Dar de baja deporte
												</Button>
											)}
										</Stack>
									</Box>
									<Button
										variant="contained"
										size="small"
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
									Este deporte está inactivo y no se ofrece para nuevas inscripciones.
								</Alert>
							)}
							{categorias.isPending ? (
								<Stack
									direction="row"
									spacing={1.5}
									role="status"
									sx={{ py: 5, justifyContent: 'center', alignItems: 'center' }}
								>
									<CircularProgress size={20} aria-label="Cargando categorías" />
									<Typography variant="body2" color="text.secondary">
										Cargando categorías…
									</Typography>
								</Stack>
							) : categorias.isError ? (
								<Alert
									severity="error"
									sx={{ m: 2 }}
									action={
										<Button size="small" color="inherit" onClick={() => void categorias.refetch()}>
											Reintentar
										</Button>
									}
								>
									No pudimos cargar las categorías.
								</Alert>
							) : categorias.data ? (
								categorias.data.length === 0 ? (
									<EmptyState
										icon={<SportsRoundedIcon />}
										title="Este deporte todavía no tiene categorías"
										description="Agregá al menos una categoría con su arancel mensual para poder inscribir socios."
										action={
											selected.estado === 'activo' ? (
												<Button
													variant="contained"
													size="small"
													startIcon={<AddRoundedIcon />}
													onClick={() => setCreateCategoria(true)}
												>
													Nueva categoría
												</Button>
											) : null
										}
									/>
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
													<TableCell align="right">Acciones</TableCell>
												</TableRow>
											</TableHead>
											<TableBody>
												{categorias.data.map((categoria) => (
													<TableRow
														key={categoria.id}
														sx={{ opacity: categoria.estado === 'activo' ? 1 : 0.68 }}
													>
														<TableCell sx={{ fontWeight: 600 }}>{categoria.nombre}</TableCell>
														<TableCell
															align="right"
															sx={{
																whiteSpace: 'nowrap',
																fontWeight: 600,
																fontVariantNumeric: 'tabular-nums',
															}}
														>
															{formatArancel(categoria.arancel_mensual)}
														</TableCell>
														<TableCell sx={{ whiteSpace: 'nowrap' }}>
															{formatEdadRango(categoria.edad_min, categoria.edad_max)}
														</TableCell>
														<TableCell>
															<Chip
																size="small"
																label={categoria.estado === 'activo' ? 'Activa' : 'Inactiva'}
																color={categoria.estado === 'activo' ? 'success' : 'default'}
															/>
														</TableCell>
														<TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
															<Stack
																direction="row"
																spacing={0.5}
																sx={{ justifyContent: 'flex-end' }}
															>
																<Button
																	size="small"
																	variant="outlined"
																	aria-label={`Editar categoría ${categoria.nombre}`}
																	disabled={!enabled}
																	onClick={() =>
																		setEditCategoria({
																			registro: categoria,
																			deporteNombre: selected.nombre,
																		})
																	}
																>
																	Editar
																</Button>
																{categoria.estado === 'activo' && (
																	<Button
																		size="small"
																		color="error"
																		aria-label={`Dar de baja categoría ${categoria.nombre}`}
																		disabled={!enabled}
																		onClick={() =>
																			setBajaTarget({ tipo: 'categoria', registro: categoria })
																		}
																	>
																		Dar de baja
																	</Button>
																)}
															</Stack>
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</TableContainer>
								)
							) : null}
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
						<EmptyState
							icon={<SportsRoundedIcon />}
							title="Categorías y aranceles"
							description="Seleccioná un deporte del listado para consultar sus categorías y administrar aranceles."
						/>
					)}
				</Paper>
			</Box>

			{editDeporte && (
				<EditDeporteDialog
					key={`edit-deporte-${editDeporte.id}`}
					deporte={editDeporte}
					onClose={() => setEditDeporte(null)}
					onSaved={(row) => {
						setEditDeporte(null);
						setSuccess(`Deporte ${row.nombre} actualizado.`);
						reloadCatalogo();
					}}
				/>
			)}
			{editCategoria && (
				<EditCategoriaDialog
					key={`edit-categoria-${editCategoria.registro.id}`}
					categoria={editCategoria.registro}
					deporteNombre={editCategoria.deporteNombre}
					onClose={() => setEditCategoria(null)}
					onSaved={(row) => {
						setEditCategoria(null);
						setSuccess(
							`Categoría ${row.nombre} actualizada. Las cuotas ya emitidas conservan su importe.`,
						);
						reloadCatalogo();
					}}
				/>
			)}
			{bajaTarget && (
				<DeactivateCatalogoDialog
					key={`baja-${bajaTarget.tipo}-${bajaTarget.registro.id}`}
					target={bajaTarget}
					onClose={() => setBajaTarget(null)}
					onChanged={() => {
						setBajaTarget(null);
						setSuccess(
							`${bajaTarget.registro.nombre} quedó ${bajaTarget.tipo === 'categoria' ? 'inactiva' : 'inactivo'}. El historial se conserva.`,
						);
						reloadCatalogo();
					}}
				/>
			)}
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
