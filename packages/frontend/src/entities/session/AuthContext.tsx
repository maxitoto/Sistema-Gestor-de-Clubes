// src/shared/contexts/AuthContext.tsx

import type {
	AuthError,
	Session,
	SignInWithPasswordCredentials,
	User,
} from '@supabase/supabase-js';
import { createContext } from 'react';
import type { Tables } from '#shared/types';

type PerfilUsuario = Tables<'usuarios'>;

export interface AuthContextType {
	session: Session | null;
	user: User | null;
	isLoading: boolean;
	perfil: PerfilUsuario | null;

	login: (credentials: SignInWithPasswordCredentials) => Promise<{ error: AuthError | null }>;
	logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
