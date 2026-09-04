// src/modules/socios/model/useSocios.ts

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { getSocios } from '../api/socios.api';

export function useSocios(page: number, limit: number, searchTerm: string) {
  return useQuery({
    // La clave ahora está perfectamente estructurada
    queryKey: ['socios', { page, limit, searchTerm }],
    queryFn: () => getSocios({ page, limit, searchTerm }),
    placeholderData: keepPreviousData, // Evita parpadeos en la paginación
  });
}