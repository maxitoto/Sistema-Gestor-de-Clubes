// src/features/club/update-config/ui/SettingsForm.tsx
import { useState } from "react";
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Alert,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useUpdateClubConfig } from "../model/useUpdateClubConfig";
import type { Database } from "#shared/types/model";

type ClubRow = Database["public"]["Tables"]["club"]["Row"];
type ClubUpdate = Database["public"]["Tables"]["club"]["Update"];

export function SettingsForm({ initialData }: { initialData: ClubRow | null }) {
  const navigate = useNavigate();
  const updateMutation = useUpdateClubConfig(); // <-- Lo lee de su propio segmento model/

  const [formData, setFormData] = useState<ClubUpdate>({
    nombre: initialData?.nombre || "",
    cuit: initialData?.cuit || "",
    domicilio_fiscal: initialData?.domicilio_fiscal || "",
    email_contacto: initialData?.email_contacto || "",
    punto_venta: initialData?.punto_venta || 1,
    logo_url: initialData?.logo_url || "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "number" ? Number(value) : value,
    }));
  };

  const handleGuardar = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!initialData?.id) {
      alert("No se encontró el ID de la configuración.");
      return;
    }
    updateMutation.mutate(
      { id: initialData.id, payload: formData },
      { onSuccess: () => alert("¡Configuración actualizada con éxito!") },
    );
  };

  return (
    <Paper elevation={3} sx={{ p: 4, maxWidth: 600, mx: "auto", mt: 4 }}>
      <Typography
        variant="h4"
        component="h1"
        gutterBottom
        sx={{ fontWeight: "bold" }}
      >
        Configuración del Club
      </Typography>

      {updateMutation.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {updateMutation.error.message}
        </Alert>
      )}

      <Box
        component="form"
        onSubmit={handleGuardar}
        sx={{ display: "flex", flexDirection: "column", gap: 3 }}
      >
        <TextField
          label="Nombre / Razón Social"
          name="nombre"
          value={formData.nombre}
          onChange={handleChange}
          fullWidth
          required
          disabled={updateMutation.isPending}
        />
        <TextField
          label="CUIT"
          name="cuit"
          value={formData.cuit}
          onChange={handleChange}
          fullWidth
          required
          disabled={updateMutation.isPending}
        />
        <TextField
          label="Domicilio Fiscal"
          name="domicilio_fiscal"
          value={formData.domicilio_fiscal}
          onChange={handleChange}
          fullWidth
          required
          disabled={updateMutation.isPending}
        />
        <TextField
          label="Email de Contacto"
          name="email_contacto"
          type="email"
          value={formData.email_contacto}
          onChange={handleChange}
          fullWidth
          required
          disabled={updateMutation.isPending}
        />
        <TextField
          label="Punto de Venta"
          name="punto_venta"
          type="number"
          value={formData.punto_venta}
          onChange={handleChange}
          fullWidth
          required
          disabled={updateMutation.isPending}
        />
        <TextField
          label="URL del Logo (Opcional)"
          name="logo_url"
          value={formData.logo_url}
          onChange={handleChange}
          fullWidth
          disabled={updateMutation.isPending}
        />

        <Box
          sx={{ display: "flex", gap: 2, justifyContent: "flex-end", mt: 2 }}
        >
          <Button
            variant="outlined"
            color="inherit"
            onClick={() => navigate(-1)}
            disabled={updateMutation.isPending}
          >
            Volver
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </Box>
      </Box>
    </Paper>
  );
}
