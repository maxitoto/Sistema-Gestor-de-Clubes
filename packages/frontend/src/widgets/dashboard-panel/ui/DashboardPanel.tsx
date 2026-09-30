// src/widgets/dashboard-panel/ui/DashboardPanel.tsx

import {
	Alert,
	Box,
	Button,
	Checkbox,
	CircularProgress,
	MenuItem,
	Paper,
	TextField,
	Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useAuth } from '#entities/session';
import { useSocios } from '#entities/socio';
import { SendEmailPanel } from '#features/send-email';
import { useDebounce } from '#shared/lib/useDebounce';

export function DashboardPanel() {
	const { cacheScope, profileStatus } = useAuth();
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const [searchTerm, setSearchTerm] = useState('');
	const debouncedSearchTerm = useDebounce(searchTerm, 500);
	const { data, isLoading, isFetching, isError, refetch } = useSocios(
		page,
		pageSize,
		debouncedSearchTerm,
		{ cacheScope, enabled: profileStatus === 'ready' },
	);
	const [selected, setSelected] = useState<string[]>([]);
	const [sending, setSending] = useState(false);
	const filtering = searchTerm !== debouncedSearchTerm;
	const disabled = filtering || isFetching || sending;
	useEffect(() => {
		if (data && page > data.totalPages) {
			setPage(data.totalPages);
			setSelected([]);
		}
	}, [data, page]);
	useEffect(() => {
		if (!data) {
			return;
		}
		const visibleIds = new Set(data.socios.map((socio) => socio.id));
		setSelected((previous) => {
			const visible = previous.filter((id) => visibleIds.has(id));
			return visible.length === previous.length ? previous : visible;
		});
	}, [data]);
	const toggle = (id: string) =>
		setSelected((previous) =>
			previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id],
		);
	const changePage = (next: number) => {
		setSelected([]);
		setPage(next);
	};
	return (
		<Paper sx={{ p: 3, mt: 3 }}>
			<Typography variant="h6" gutterBottom>
				Nómina de Socios
			</Typography>
			<TextField
				label="Buscar por apellido"
				size="small"
				value={searchTerm}
				disabled={sending}
				onChange={(event) => {
					setSelected([]);
					setPage(1);
					setSearchTerm(event.target.value);
				}}
				sx={{ mb: 2 }}
			/>
			<TextField
				select
				label="Socios por página"
				size="small"
				value={pageSize}
				disabled={sending}
				sx={{ ml: 2, mb: 2, minWidth: 160 }}
				onChange={(event) => {
					setSelected([]);
					setPage(1);
					setPageSize(Number(event.target.value));
				}}
			>
				{[20, 50, 100].map((size) => (
					<MenuItem key={size} value={size}>
						{size}
					</MenuItem>
				))}
			</TextField>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				La selección se limita a la página visible y se limpia al cambiar de página o búsqueda.
			</Typography>
			{(isLoading || filtering) && <CircularProgress aria-label="Buscando socios" />}
			{isError && (
				<Alert severity="error" action={<Button onClick={() => void refetch()}>Reintentar</Button>}>
					No pudimos cargar los socios. Revise su conexión.
				</Alert>
			)}
			{!isLoading && !isError && !filtering && data && (
				<>
					{data.socios.length === 0 ? (
						<Alert severity="info">No se encontraron socios para esta búsqueda.</Alert>
					) : (
						<ul style={{ listStyle: 'none', padding: 0 }}>
							{data.socios.map((socio) => (
								<li
									key={socio.id}
									style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}
								>
									<Checkbox
										checked={selected.includes(socio.id)}
										onChange={() => toggle(socio.id)}
										disabled={disabled}
										slotProps={{
											input: {
												'aria-label': `Seleccionar a ${socio.apellido}, ${socio.nombre}, DNI ${socio.dni}`,
											},
										}}
									/>
									<Typography>
										<strong>
											{socio.apellido}, {socio.nombre}
										</strong>{' '}
										— DNI: {socio.dni} ({socio.estado})<br />
										{socio.email || 'Sin correo'} —{' '}
										{socio.email_invalido
											? 'Correo inválido'
											: socio.acepta_comunicaciones
												? 'Suscripto'
												: 'Desuscripto'}
									</Typography>
								</li>
							))}
						</ul>
					)}
					<Box sx={{ mt: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
						<Button disabled={page <= 1 || disabled} onClick={() => changePage(page - 1)}>
							Anterior
						</Button>
						<Typography>
							Página {page} de {data.totalPages}
						</Typography>
						<Button
							disabled={page >= data.totalPages || disabled}
							onClick={() => changePage(page + 1)}
						>
							Siguiente
						</Button>
					</Box>
				</>
			)}
			<SendEmailPanel
				selectedSocios={selected}
				onClearSelection={() => setSelected([])}
				onPendingChange={setSending}
				disabled={isFetching || filtering || isError}
				selectedLabels={(data?.socios ?? [])
					.filter((socio) => selected.includes(socio.id))
					.map(
						(socio) =>
							`${socio.apellido}, ${socio.nombre} (${socio.dni}, ${socio.estado}) — ${socio.email || 'Sin correo'} — ${socio.email_invalido ? 'Inválido' : socio.acepta_comunicaciones ? 'Suscripto' : 'Desuscripto'}`,
					)}
			/>
		</Paper>
	);
}
