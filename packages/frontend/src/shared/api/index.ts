// src/shared/utils/index.ts

export { createHumanRequestClient } from './humanRequest';
export type { ArchivoCargado, IdentidadArchivo, LecturaArchivo, TipoArchivo } from './storage.api';
export { asociarArchivo, descartarArchivo, leerArchivo, subirArchivo } from './storage.api';
export { supabase } from './supabaseClient';
