import { Box, Typography, Paper, CircularProgress, Alert } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { api } from '#services/apis';

export default function Dashboard () {

  const { data: socios, isLoading, isError, error } = useQuery({
    queryKey: ['socios'], // Identificador único para la caché
    queryFn: api.socios.getAll,
  });

  return (
    <Box sx={{ p: 4, bgcolor: 'grey.50', minHeight: '100vh' }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 'bold' }}>
        Dashboard del Club
      </Typography>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Nómina de Socios (Vía Edge Functions)
        </Typography>

        {isLoading && <CircularProgress />}
        {isError && <Alert severity="error">{error.message}</Alert>}

        {!isLoading && !isError && (
          <ul>
            {socios.map((socio) => (
              <li key={socio.id}>
                <strong>{socio.apellido}, {socio.nombre}</strong> - DNI: {socio.dni} ({socio.estado})
              </li>
            ))}
          </ul>
        )}
      </Paper>
    </Box>
  );
};