import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { coursKeys } from '@/features/cours/hooks/coursKeys'
import * as coursRepo from '@/shared/supabase/coursRepo'
import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'

/** Fiche d'un cours. Inactive tant qu'`id` est absent. */
export function useCoursDetail(
  id: string | undefined
): UseQueryResult<CoursAvecDetails | null, Error> {
  return useQuery({
    queryKey: coursKeys.detail(id ?? ''),
    queryFn: () => coursRepo.getById(id as string),
    enabled: Boolean(id),
  })
}
