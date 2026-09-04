import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { suiviKeys } from '@/features/suivi/hooks/suiviKeys'
import * as suiviRepo from '@/shared/supabase/suiviRepo'
import type { ParcoursApprenant } from '@/shared/supabase/suiviSchema'

/**
 * Le parcours de l'apprenant, ou `null` si le jeton ne correspond à rien.
 *
 * Depuis 0025, c'est une LISTE — un bloc par cours suivi, du plus ancien au plus
 * récent. Un tableau vide est ramené à `null` par le repository, pour que la
 * page n'ait qu'un seul message neutre à afficher.
 */
export function useSuiviApprenant(
  jeton: string | undefined
): UseQueryResult<ParcoursApprenant | null, Error> {
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
