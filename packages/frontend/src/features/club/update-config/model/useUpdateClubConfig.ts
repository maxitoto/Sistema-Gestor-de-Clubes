// src/features/club/update-config/model/useUpdateClubConfig.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateClubConfig } from '#entities/club';
import { clubKeys } from "#entities/club";

export function useUpdateClubConfig() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: updateClubConfig,
    onSuccess: () => {
      // Invalida la query de la entidad para que la página se refresque
      queryClient.invalidateQueries({ queryKey: clubKeys.config });
    },
  });
}