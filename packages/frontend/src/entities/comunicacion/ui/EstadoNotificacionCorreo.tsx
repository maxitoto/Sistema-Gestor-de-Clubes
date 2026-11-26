import { Alert, Button } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { getNotificacionCorreo } from '../api/comunicaciones.api';

export function EstadoNotificacionCorreo({
	operation,
	actorId,
	cacheScope,
	enabled,
}: {
	operation: { comprobanteId: string } | { jobId: string };
	actorId: string;
	cacheScope: string;
	enabled: boolean;
}) {
	const startRef = useRef(Date.now());
	const q = useQuery({
		queryKey: ['notificacion-operacion', cacheScope, operation],
		queryFn: ({ signal }) => getNotificacionCorreo(operation, actorId, signal),
		enabled,
		retry: 1,
		refetchInterval: (query) =>
			Date.now() - startRef.current < 120000 && query.state.data?.estado === 'pendiente'
				? 5000
				: false,
		refetchIntervalInBackground: false,
	});

	if (q.isError) {
		return (
			<Alert
				severity="warning"
				action={
					<Button size="small" color="inherit" onClick={() => void q.refetch()}>
						Reintentar
					</Button>
				}
			>
				No pudimos consultar el estado del aviso por correo. La operación sigue confirmada.
			</Alert>
		);
	}

	if (!q.data || q.data.estado === 'sin_notificacion') {
		return null;
	}

	return (
		<Alert
			severity={q.data.estado === 'advertencia' ? 'warning' : 'info'}
			action={
				<Button size="small" color="inherit" component={Link} to="/comunicaciones">
					Ver envíos
				</Button>
			}
		>
			{q.data.advertencia ??
				(q.data.estado === 'encolado'
					? 'Aviso por correo programado para envío. La entrega todavía no fue confirmada.'
					: 'Preparando el aviso por correo… La operación confirmada mantiene su resultado.')}
		</Alert>
	);
}
