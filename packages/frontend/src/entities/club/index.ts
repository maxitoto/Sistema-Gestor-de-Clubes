// src/entities/club/index.ts

export type { ClubConfig, ClubUpdate } from '#shared/types/club';
export { getClubConfig, updateClubConfig } from './api/club.api';
export type { UseClubConfigOptions } from './model/useClub';
export { clubKeys, useClubConfig } from './model/useClub';
