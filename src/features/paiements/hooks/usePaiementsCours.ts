import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { paiementKeys } from '@/features/paiements/hooks/paiementKeys'
import * as paiementRepo from '@/shared/supabase/paiementRepo'
import type { Paiement } from '@/shared/supabase/paiementRepo'

/**
 * Règlements d'un cours, du mois le plus récent au plus ancien.
 * Ils restent visibles quel que soit le statut du cours : on n'efface pas une
 * recette parce qu'un cours a été mis en pause.
 */
export function usePaiementsCours(
  coursId: string | undefined
): UseQueryResult<Paiement[], Error> {
  return useQuery({
    queryKey: paiementKeys.parCours(coursId ?? ''),
    queryFn: () => paiementRepo.listParCours(coursId as string),
    enabled: Boolean(coursId),
  })
}
