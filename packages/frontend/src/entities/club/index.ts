// src/entities/club/index.ts

export type { ClubConfig, ClubUpdate } from '#shared/types/club';
export { getClubConfig, updateClubConfig } from './api/club.api';
export type { EstadoFiscal } from './api/fiscal.api';
export { getEstadoFiscal, guardarCredencialesFiscales } from './api/fiscal.api';
export type { UseClubConfigOptions } from './model/useClub';
export { clubKeys, useClubConfig } from './model/useClub';

export { useClubLogo } from './model/useClubLogo';
