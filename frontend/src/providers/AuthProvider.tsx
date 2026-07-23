import { useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '#services/supabaseClient';
import { AuthContext } from '#contexts/AuthContext';
import type { Tables } from '#types/model';

type PerfilUsuario = Tables<'usuarios'>;

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSessionAndProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        const { data } = await supabase
          .from('usuarios')
          .select('*')
          .eq('id', session.user.id)
          .single();
        setPerfil(data);
      } else {
        setPerfil(null);
      }
      setIsLoading(false);
    };

    fetchSessionAndProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchSessionAndProfile(); // Recargamos si cambia la sesión
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    // Asegúrate de agregar `perfil` a tu AuthContextType en AuthContext.tsx
    <AuthContext.Provider value={{ session, user, perfil, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};