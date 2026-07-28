import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { inscriptionKeys } from '@/features/inscriptions/hooks/inscriptionKeys'
import * as inscriptionRepo from '@/shared/supabase/inscriptionRepo'
import type { InscriptionAvecApprenant } from '@/shared/supabase/inscriptionRepo'

/** Apprenants inscrits à un cours. Inactive tant que `coursId` est absent. */
export function useInscriptionsCours(
  coursId: string | undefined
): UseQueryResult<InscriptionAvecApprenant[], Error> {
  return useQuery({
    queryKey: inscriptionKeys.parCours(coursId ?? ''),
    queryFn: () => inscriptionRepo.listByCours(coursId as string),
    enabled: Boolean(coursId),
  })
}
