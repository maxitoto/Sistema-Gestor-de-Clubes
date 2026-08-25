import { useState } from "react";
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Button,
  TextField,
  Checkbox,
  Snackbar
} from "@mui/material";
import { useSocios } from "#hooks/useSocios";
import { useDebounce } from "#hooks/useDebounce";
// Importamos tu hook de comunicaciones
import { useAvisoManual } from "#hooks/useEmail";

export default function Dashboard() {
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const { data, isLoading, isError, error } = useSocios(page, 5, debouncedSearchTerm);
  
  // Hook de la Edge Function
  const avisoMutation = useAvisoManual();

  // Arreglamos el estado: un array de IDs (strings)
  const [selectedSocios, setSelectedSocios] = useState<string[]>([]);
  const [mensajeExito, setMensajeExito] = useState('');

  // Lógica de Toggle: agrega o quita el ID según corresponda
  const handleToggle = (socioId: string) => {
    setSelectedSocios((prevSelected) => {
      if (prevSelected.includes(socioId)) {
        return prevSelected.filter((id) => id !== socioId); // Lo quita
      } else {
        return [...prevSelected, socioId]; // Lo agrega
      }
    });
  };

  const handleEnviar = () => {
    avisoMutation.mutate(
      {
        asunto: 'Aviso Importante',
        cuerpo: '¡Hola! Han sido seleccionados para este aviso especial del club.',
        sociosIds: selectedSocios
      },
      {
        onSuccess: (cantidad: number) => {
          setMensajeExito(`¡Listo! Se envió el mensaje a ${cantidad} socios.`);
          setSelectedSocios([]); // Vaciamos la selección tras el éxito
        }
      }
    );
  };

  return (
    <Box sx={{ p: 4, minHeight: "100vh" }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: "bold" }}>
        Dashboard del Club
      </Typography>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Nómina de Socios
        </Typography>

        <Box sx={{ mb: 3 }}>
          <TextField 
            label="Buscar por apellido" 
            variant="outlined" 
            size="small"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1); 
            }}
          />
        </Box>

        {isLoading && <CircularProgress />}
        {isError && <Alert severity="error">{error.message}</Alert>}
        {avisoMutation.isError && <Alert severity="error" sx={{ mb: 2 }}>{avisoMutation.error.message}</Alert>}

        {!isLoading && !isError && data && (
          <>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {data.socios.map((socio) => (
                <li key={socio.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <Checkbox 
                    // El checkbox se marca si el ID está en el array
                    checked={selectedSocios.includes(socio.id)}
                    // Al cambiar, ejecutamos el toggle pasándole el ID
                    onChange={() => handleToggle(socio.id)}
                    disabled={socio.estado !== 'activo'} // Opcional: no permitir envíos a inactivos
                  />
                  <Typography>
                    <strong>{socio.apellido}, {socio.nombre}</strong> - DNI: {socio.dni} ({socio.estado})
                  </Typography>
                </li>
              ))}
            </ul>

            {/* Controles de Paginación UI */}
            <Box sx={{ mt: 2, display: "flex", gap: 2, alignItems: "center" }}>
              <Button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <Typography>
                Página {page} de {data.totalPages}
              </Typography>
              <Button
                disabled={page === data.totalPages || data.totalPages === 0}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </Button>
            </Box>

            {/* Panel de Envío de Correos */}
            <Box sx={{ mt: 4, pt: 3, borderTop: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body1" color="text.secondary">
                {selectedSocios.length} socios seleccionados para recibir correo
              </Typography>
              
              <Button 
                variant="contained" 
                color="secondary"
                size="large"
                disabled={selectedSocios.length === 0 || avisoMutation.isPending}
                onClick={handleEnviar}
              >
                {avisoMutation.isPending ? 'Enviando...' : 'Enviar Correo'}
              </Button>
            </Box>
          </>
        )}
      </Paper>

      {/* Alerta flotante de éxito */}
      <Snackbar 
        open={!!mensajeExito} 
        autoHideDuration={6000} 
        onClose={() => setMensajeExito('')}
        message={mensajeExito} 
      />
    </Box>
  );
}