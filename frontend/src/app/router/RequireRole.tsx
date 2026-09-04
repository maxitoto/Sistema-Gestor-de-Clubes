// src/app/router/RequireRole.tsx
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "#entities/session";
import type { Database } from "#shared/types";

// Extraemos los roles válidos de la base de datos para tipado estricto
type Rol = Database["public"]["Enums"]["rol_usuario"];

interface Props {
  roles: Rol[];
}

export const RequireRole = ({ roles }: Props) => {
  const { perfil } = useAuth();

  if (!perfil || !roles.includes(perfil.rol)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};
