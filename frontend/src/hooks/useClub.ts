import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getClubConfig, updateClubConfig } from '#apis/club.api';

export const clubKeys = {
  config: ['club-config'] as const,
};

export function useClubConfig() {
  return useQuery({
    queryKey: clubKeys.config,
    queryFn: getClubConfig,
  });
}

export function useUpdateClubConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateClubConfig, // <-- Pasamos la función directamente
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubKeys.config });
    },
  });
}