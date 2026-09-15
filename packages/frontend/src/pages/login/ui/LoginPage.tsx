// src/pages/login/ui/LoginPage.tsx
import { Navigate } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { useAuth } from "#entities/session/useAuth";
import { LoginForm } from "#features/auth/login-by-email";

export default function LoginPage() {
  const { session, isLoading } = useAuth();

  return (
    <Box sx={{ flexGrow: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {
        isLoading && <CircularProgress />
      }
      {
        !isLoading && <LoginForm />
      }
      {
        !isLoading && !session && <Navigate to="/login" replace />
      }
    </Box>
  );
}