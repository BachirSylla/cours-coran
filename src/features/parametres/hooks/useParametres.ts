import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import { parametresKeys } from '@/features/parametres/hooks/parametresKeys'
import * as parametresRepo from '@/shared/supabase/parametresRepo'
import type { ParametresEffectifs } from '@/shared/supabase/parametresRepo'

/**
 * Réglages applicables. Renvoie toujours une valeur exploitable : le repository
 * retombe sur les défauts quand aucune ligne n'existe, si bien que l'appelant
 * n'a jamais à gérer l'absence.
 *
 * La clé porte l'identifiant du compte, parce que le barème de récitation, lui,
 * est propre à chaque enseignant (migration 0012).
 */
export function useParametres(): UseQueryResult<ParametresEffectifs, Error> {
  const { user } = useAuth()
  const userId = user?.id ?? null

  return useQuery({
    queryKey: parametresKeys.duCompte(userId),
    queryFn: () => parametresRepo.get(userId),
    // Réglage rarement modifié : inutile de le redemander sans cesse.
    staleTime: 60 * 60_000,
  })
}
