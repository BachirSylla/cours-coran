import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { apprenantKeys } from '@/features/apprenants/hooks/apprenantKeys'
import * as apprenantRepo from '@/shared/supabase/apprenantRepo'
import type { Apprenant } from '@/shared/supabase/apprenantRepo'

/** Liste des apprenants du propriétaire connecté. */
export function useApprenants(): UseQueryResult<Apprenant[], Error> {
  return useQuery({
    queryKey: apprenantKeys.liste(),
    queryFn: () => apprenantRepo.list(),
  })
}
