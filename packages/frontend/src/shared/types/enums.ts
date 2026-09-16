import { Constants } from './';

// 1. Apuntamos al objeto Constants generado por Supabase
type SupabaseEnums = typeof Constants.public.Enums;

// 2. Extraemos los tipos literales puros
export type RolUsuario = SupabaseEnums['rol_usuario'][number];
export type EstadoBasico = SupabaseEnums['estado_basico'][number];
export type MedioPago = SupabaseEnums['medio_pago'][number];

// BONUS: Como Constants es un objeto real (no solo tipos),
// puedes exportarlos para usarlos en tus <select> del frontend:
export const ROLES_USUARIO_OPTIONS = Constants.public.Enums.rol_usuario;
