// src/widgets/dashboard-panel/ui/DashboardPanel.tsx
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
} from "@mui/material";
import { useSocios } from "#entities/socio";
import { useDebounce } from "#shared/lib/useDebounce";
import { SendEmailPanel } from "#features/comunicaciones/send-email"; // <-- Importamos la feature!

export function DashboardPanel() {
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  // 1. Entidad: Traemos los datos
  const { data, isLoading, isError, error } = useSocios(
    page,
    5,
    debouncedSearchTerm,
  );

  // 2. Estado local del orquestador: Quiénes están seleccionados
  const [selectedSocios, setSelectedSocios] = useState<string[]>([]);

  const handleToggle = (socioId: string) => {
    setSelectedSocios((prev) =>
      prev.includes(socioId)
        ? prev.filter((id) => id !== socioId)
        : [...prev, socioId],
    );
  };

  return (
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

      {!isLoading && !isError && data && (
        <>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {data.socios.map((socio) => (
              <li
                key={socio.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <Checkbox
                  checked={selectedSocios.includes(socio.id)}
                  onChange={() => handleToggle(socio.id)}
                  disabled={socio.estado !== "activo"}
                />
                <Typography>
                  <strong>
                    {socio.apellido}, {socio.nombre}
                  </strong>{" "}
                  - DNI: {socio.dni} ({socio.estado})
                </Typography>
              </li>
            ))}
          </ul>

          <Box sx={{ mt: 2, display: "flex", gap: 2, alignItems: "center" }}>
            <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
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

          {/* 3. Feature: Inyectamos el panel y le pasamos los datos */}
          <SendEmailPanel
            selectedSocios={selectedSocios}
            onClearSelection={() => setSelectedSocios([])}
          />
        </>
      )}
    </Paper>
  );
}
