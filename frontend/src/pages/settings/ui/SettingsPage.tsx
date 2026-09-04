// src/pages/settings/ui/SettingsPage.tsx
import { CircularProgress, Alert } from "@mui/material";
import { useClubConfig } from "#entities/club";
import { SettingsForm } from "#features/club/update-config";

export default function SettingsPage() {
  // Pide los datos base a la Entidad
  const { data: configActual, isLoading, error } = useClubConfig();

  if (isLoading) return <CircularProgress sx={{ display: "block", mx: "auto", mt: 4 }} />;
  if (error) return <Alert severity="error" sx={{ maxWidth: 600, mx: "auto", mt: 4 }}>Error al cargar la configuración</Alert>;

  // Le inyecta los datos a la Feature que se encarga de todo lo demás
  return <SettingsForm initialData={configActual || null} />;
}