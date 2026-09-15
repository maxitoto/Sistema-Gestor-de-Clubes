// src/modules/comuniciones/model/useEmail.ts

import { useMutation } from '@tanstack/react-query';
import { dispararAvisoManual } from '../api/email.api';

export function useAvisoManual() {
  return useMutation({
    mutationFn: dispararAvisoManual,
  });
}