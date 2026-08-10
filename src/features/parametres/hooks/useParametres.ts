import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { parametresKeys } from '@/features/parametres/hooks/parametresKeys'
import * as parametresRepo from '@/shared/supabase/parametresRepo'
import type { ParametresEffectifs } from '@/shared/supabase/parametresRepo'

/**
 * Paramètres du compte. Renvoie toujours une valeur exploitable : le repository
 * retombe sur les défauts quand aucune ligne n'existe, si bien que l'appelant
 * n'a jamais à gérer l'absence.
 */
export function useParametres(): UseQueryResult<ParametresEffectifs, Error> {
  return useQuery({
    queryKey: parametresKeys.tous,
    queryFn: () => parametresRepo.get(),
    // Réglage rarement modifié : inutile de le redemander sans cesse.
    staleTime: 60 * 60_000,
  })
}
