import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { inscriptionKeys } from '@/features/inscriptions/hooks/inscriptionKeys'
import * as inscriptionRepo from '@/shared/supabase/inscriptionRepo'
import type { InscriptionAvecCours } from '@/shared/supabase/inscriptionRepo'

/** Cours suivis par un apprenant. Inactive tant qu'`apprenantId` est absent. */
export function useInscriptionsApprenant(
  apprenantId: string | undefined
): UseQueryResult<InscriptionAvecCours[], Error> {
  return useQuery({
    queryKey: inscriptionKeys.parApprenant(apprenantId ?? ''),
    queryFn: () => inscriptionRepo.listByApprenant(apprenantId as string),
    enabled: Boolean(apprenantId),
  })
}
