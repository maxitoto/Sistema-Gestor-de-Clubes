// src/features/comunicaciones/send-email/ui/SendEmailPanel.tsx
import { useState } from "react";
import { Box, Typography, Button, Snackbar } from "@mui/material";
import { useAvisoManual } from "../model/useEmail";

interface Props {
  selectedSocios: string[];
  onClearSelection: () => void;
}

export function SendEmailPanel({ selectedSocios, onClearSelection }: Props) {
  const avisoMutation = useAvisoManual();
  const [mensajeExito, setMensajeExito] = useState("");

  const handleEnviar = () => {
    avisoMutation.mutate(
      {
        asunto: "Aviso Importante",
        cuerpo: "¡Hola! Han sido seleccionados para este aviso especial del club.",
        sociosIds: selectedSocios,
      },
      {
        onSuccess: (cantidad: number) => {
          setMensajeExito(`¡Listo! Se envió el mensaje a ${cantidad} socios.`);
          onClearSelection(); // Le decimos al Widget que limpie los checkboxes
        },
      },
    );
  };

  return (
    <>
      <Box sx={{ mt: 4, pt: 3, borderTop: "1px solid #e0e0e0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
          {avisoMutation.isPending ? "Enviando..." : "Enviar Correo"}
        </Button>
      </Box>

      <Snackbar
        open={!!mensajeExito}
        autoHideDuration={6000}
        onClose={() => setMensajeExito("")}
        message={mensajeExito}
      />
    </>
  );
}