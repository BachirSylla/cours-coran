import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { suiviKeys } from '@/features/suivi/hooks/suiviKeys'
import * as suiviRepo from '@/shared/supabase/suiviRepo'
import type { SuiviApprenant } from '@/shared/supabase/suiviSchema'

/** Le suivi de l'apprenant, ou `null` si le jeton ne correspond à rien. */
export function useSuiviApprenant(
  jeton: string | undefined
): UseQueryResult<SuiviApprenant | null, Error> {
  return useQuery({
    queryKey: suiviKeys.parJeton(jeton ?? ''),
    queryFn: () => suiviRepo.getParJeton(jeton as string),
    enabled: Boolean(jeton),
    // Un lien révoqué ne redeviendra pas valide en réessayant : une seule
    // tentative, et l'apprenant a sa réponse tout de suite.
    retry: false,
    // Plus court que la page de cours : ici, une note peut tomber pendant que
    // l'onglet reste ouvert.
    staleTime: 60_000,
  })
}
