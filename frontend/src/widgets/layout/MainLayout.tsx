// src/widgets/layout/MainLayout.tsx
import { Outlet, useNavigate } from "react-router-dom";
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  Button,
  IconButton,
} from "@mui/material";
import { useContext } from "react";
import { ThemeModeContext } from "#shared/config/styles";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import SettingsIcon from "@mui/icons-material/Settings";
import { useClubConfig } from "#entities/club"; // <-- Importamos la Entidad
import { useAuth } from "#entities/session";

export const MainLayout = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { toggleColorMode, mode } = useContext(ThemeModeContext);

  // FSD PURO: El Widget le pide los datos a la Entidad, no a la BD.
  const { data: clubConfig } = useClubConfig();
  const tituloApp = clubConfig?.nombre || "Gestor de Clubes";

  const handleLogout = async () => {
    await logout();
  };

  const handleConfig = () => {
    navigate("/settings");
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: "bold" }}>
            {tituloApp}
          </Typography>

          <IconButton
            color="inherit"
            onClick={toggleColorMode}
            sx={{ mr: 2 }}
            aria-label={mode === "dark" ? "Modo Claro" : "Modo Oscuro"}
          >
            {mode === "dark" ? <Brightness7Icon /> : <Brightness4Icon />}
          </IconButton>

          <Button color="inherit" onClick={handleLogout}>
            Cerrar Sesión
          </Button>

          <IconButton
            color="inherit"
            onClick={handleConfig}
            sx={{ ml: 2 }}
            aria-label="Configuración"
          >
            <SettingsIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Outlet />
      </Box>
    </Box>
  );
};
