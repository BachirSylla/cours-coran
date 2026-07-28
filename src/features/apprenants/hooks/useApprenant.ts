import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { apprenantKeys } from '@/features/apprenants/hooks/apprenantKeys'
import * as apprenantRepo from '@/shared/supabase/apprenantRepo'
import type { Apprenant } from '@/shared/supabase/apprenantRepo'

/** Fiche d'un apprenant. La requête reste inactive tant qu'`id` est absent. */
export function useApprenant(id: string | undefined): UseQueryResult<Apprenant | null, Error> {
  return useQuery({
    queryKey: apprenantKeys.detail(id ?? ''),
    queryFn: () => apprenantRepo.getById(id as string),
    enabled: Boolean(id),
  })
}
