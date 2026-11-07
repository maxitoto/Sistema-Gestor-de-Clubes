import { Box, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '#entities/session';
import { CategoriasGastoPanel } from '#features/manage-categoria-gasto';
import { CajaPanel } from '#widgets/caja-panel';
import { GastosPanel } from '#widgets/gastos-panel';
export function GastosPage() {
	const { cacheScope } = useAuth();
	return <GastosContent key={cacheScope} />;
}
function GastosContent() {
	const { perfil } = useAuth();
	const [params, setParams] = useSearchParams();
	const requested = params.get('vista') ?? params.get('tab');
	const tab =
		requested === 'movimientos' || (requested === 'categorias' && perfil?.rol === 'admin')
			? requested
			: 'gastos';
	const setTab = (value: string) => {
		const next = new URLSearchParams(params);
		next.set('vista', value);
		next.delete('gastoId');
		setParams(next);
	};
	return (
		<Stack spacing={3}>
			<Box>
				<Typography variant="h4" component="h1">
					Gastos e ingresos
				</Typography>
				<Typography color="text.secondary" sx={{ mt: 1 }}>
					Registrá gastos y consultá los movimientos del club.
				</Typography>
			</Box>
			<Tabs
				value={tab}
				onChange={(_, value: string) => setTab(value)}
				aria-label="Consultas financieras"
				variant="scrollable"
				scrollButtons="auto"
			>
				<Tab label="Gastos" value="gastos" />
				<Tab label="Movimientos" value="movimientos" />
				{perfil?.rol === 'admin' && <Tab label="Categorías de gasto" value="categorias" />}
			</Tabs>
			<Box role="tabpanel">
				{tab === 'gastos' ? (
					<GastosPanel />
				) : tab === 'movimientos' ? (
					<CajaPanel
						{...(params.get('desde') && params.get('hasta')
							? { periodo: { desde: params.get('desde') ?? '', hasta: params.get('hasta') ?? '' } }
							: {})}
					/>
				) : perfil?.rol === 'admin' ? (
					<CategoriasGastoPanel />
				) : null}
			</Box>
		</Stack>
	);
}
