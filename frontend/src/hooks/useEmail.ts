import { useMutation } from '@tanstack/react-query';
import { dispararAvisoManual } from '#apis/email.api';

export function useAvisoManual() {
  return useMutation({
    mutationFn: dispararAvisoManual,
  });
}