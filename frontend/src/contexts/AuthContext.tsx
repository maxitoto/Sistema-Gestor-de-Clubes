import { createContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export interface AuthContextType {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  perfil: {
    apellido: string;
    created_at: string | null;
    email: string;
    estado: "activo" | "inactivo";
    id: string;
    nombre: string;
    rol: "admin" | "responsable";
    updated_at: string | null;
  } | null
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);