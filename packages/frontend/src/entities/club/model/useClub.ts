// src/entities/club/model/useClub.ts
import { useQuery } from '@tanstack/react-query';
import { getClubConfig } from '../api/club.api';

export const clubKeys = {
  config: ['club-config'] as const,
};

export function useClubConfig() {
  return useQuery({
    queryKey: clubKeys.config,
    queryFn: getClubConfig,
  });
}