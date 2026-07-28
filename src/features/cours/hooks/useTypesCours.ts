import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import * as typeCoursRepo from '@/shared/supabase/typeCoursRepo'
import type { TypeCours } from '@/shared/supabase/typeCoursRepo'

export const typeCoursKeys = {
  tous: ['types-cours'] as const,
  liste: () => [...typeCoursKeys.tous, 'liste'] as const,
}

/**
 * Types de cours (table de référence). Données quasi immuables : on les garde
 * fraîches une heure plutôt que de les redemander à chaque écran.
 */
export function useTypesCours(): UseQueryResult<TypeCours[], Error> {
  return useQuery({
    queryKey: typeCoursKeys.liste(),
    queryFn: () => typeCoursRepo.list(),
    staleTime: 60 * 60_000,
  })
}
