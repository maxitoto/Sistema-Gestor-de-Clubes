import { Paper, Tab, Tabs } from '@mui/material';
import { Link, useLocation } from 'react-router-dom';
export function ComunicacionesTabs() {
	const p = useLocation().pathname;
	const value = p === '/comunicaciones/redactar' ? 1 : p === '/comunicaciones/plantillas' ? 2 : 0;
	return (
		<Paper variant="outlined" sx={{ mb: 3 }}>
			<Tabs
				value={value}
				variant="scrollable"
				scrollButtons="auto"
				aria-label="Secciones de comunicaciones"
			>
				<Tab component={Link} to="/comunicaciones" label="Historial de envíos" />
				<Tab component={Link} to="/comunicaciones/redactar" label="Redactar comunicación" />
				<Tab component={Link} to="/comunicaciones/plantillas" label="Plantillas de correo" />
			</Tabs>
		</Paper>
	);
}
