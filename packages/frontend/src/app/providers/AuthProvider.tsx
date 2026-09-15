// src/app/providers/AuthProvider.tsx
import { useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { AuthContext } from "#entities/session";
import type { Tables } from "#shared/types";
import { supabase } from "#shared/api";

type PerfilUsuario = Tables<"usuarios">;

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async (userId: string) => {
      try {
        const { data, error } = await supabase
          .from("usuarios")
          .select("*")
          .eq("id", userId)
          .single();
        if (error) throw error;
        setPerfil(data);
      } catch (err) {
        console.error("Error cargando perfil:", err);
        setPerfil(null);
      }
    };

    let isMounted = true;

    const loadSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!isMounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id); // esperamos
      } else {
        setPerfil(null);
      }
      if (isMounted) setIsLoading(false);
    };

    loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!isMounted) return;
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          await fetchProfile(newSession.user.id);
        } else {
          setPerfil(null);
        }
        if (isMounted) setIsLoading(false);
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);


  const login = async (credentials: import('@supabase/supabase-js').SignInWithPasswordCredentials) => {
    const { error } = await supabase.auth.signInWithPassword(credentials);
    return { error };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setPerfil(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, perfil, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};