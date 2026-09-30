// src/shared/contexts/AuthContext.tsx

import type {
	AuthError,
	Session,
	SignInWithPasswordCredentials,
	User,
} from '@supabase/supabase-js';
import { createContext } from 'react';
import type { Tables } from '#shared/types';

export type ProfileStatus = 'loading' | 'ready' | 'signed_out' | 'error' | 'missing' | 'inactive';

export interface AuthContextType {
	session: Session | null;
	user: User | null;
	perfil: Tables<'usuarios'> | null;
	isLoading: boolean;
	profileStatus: ProfileStatus;
	message: string | null;
	isSigningOut: boolean;
	// Cambia también al salir y volver con el mismo usuario.
	cacheScope: string;
	retryProfile: () => void;
	login: (credentials: SignInWithPasswordCredentials) => Promise<{ error: AuthError | null }>;
	logout: (reason?: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
