import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { coursKeys } from '@/features/cours/hooks/coursKeys'
import * as coursRepo from '@/shared/supabase/coursRepo'
import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'

/** Liste des cours, avec leur type et leurs créneaux. */
export function useCours(): UseQueryResult<CoursAvecDetails[], Error> {
  return useQuery({
    queryKey: coursKeys.liste(),
    queryFn: () => coursRepo.list(),
  })
}
