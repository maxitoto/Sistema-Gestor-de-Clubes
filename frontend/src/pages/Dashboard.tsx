import { useEffect, useState } from 'react';
import { supabase } from '#services/supabaseClient';
import { Box, Typography, Paper, CircularProgress, Alert } from '@mui/material';

// Definimos la interfaz basada en lo que devuelve nuestra Edge Function
interface SocioBackend {
  id: string;
  dni: string;
  nombre: string;
  apellido: string;
  estado: string;
}

export default function Dashboard () {
  const [socios, setSocios] = useState<SocioBackend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSociosDesdeBackend = async () => {
      try {
        // Invocamos la Edge Function directamente. 
        // Supabase automáticamente adjunta el JWT del usuario logueado.
        const { data, error } = await supabase.functions.invoke('get-socios');

        if (error) throw new Error(error.message);
        
        setSocios(data.socios);
      } catch (err: unknown) {
        // Aseguramos que solo guardamos un string en el estado
        if (err instanceof Error) {
            setError(err.message);
        } else if (typeof err === 'string') {
            setError(err);
        } else {
            setError('Ocurrió un error inesperado al conectar con el backend');
        }
      } finally {
        setLoading(false);
    }
    };

    fetchSociosDesdeBackend();
  }, []);

  return (
    <Box sx={{ p: 4, bgcolor: 'grey.50', minHeight: '100vh' }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 'bold' }}>
        Dashboard del Club
      </Typography>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Nómina de Socios (Vía Edge Functions)
        </Typography>

        {loading && <CircularProgress />}
        {error && <Alert severity="error">{error}</Alert>}

        {!loading && !error && (
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