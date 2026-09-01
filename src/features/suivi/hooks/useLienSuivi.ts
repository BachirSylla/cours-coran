import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { inscriptionKeys } from '@/features/inscriptions/hooks/inscriptionKeys'
import * as inscriptionRepo from '@/shared/supabase/inscriptionRepo'

/** Une mutation de suivi porte sur une inscription, vue des deux côtés. */
export interface CibleSuivi {
  inscriptionId: string
  /** Nécessaires pour invalider les deux vues de la liaison. */
  apprenantId: string
  coursId: string
}

/**
 * Ouverture, rotation et fermeture du lien privé d'un apprenant.
 *
 * Le jeton vit sur la ligne `inscription` : les trois mutations invalident donc
 * les deux familles d'`inscriptionKeys` — la fiche du cours (« qui est
 * inscrit ? ») comme celle de l'apprenant (« à quoi est-il inscrit ? »).
 */
function useMutationSuivi<T>(
  action: (inscriptionId: string) => Promise<T>
): UseMutationResult<T, Error, CibleSuivi> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ inscriptionId }: CibleSuivi) => action(inscriptionId),
    onSuccess: (_resultat, { apprenantId, coursId }) => {
      void queryClient.invalidateQueries({ queryKey: inscriptionKeys.parCours(coursId) })
      void queryClient.invalidateQueries({
        queryKey: inscriptionKeys.parApprenant(apprenantId),
      })
    },
  })
}

/** Ouvre le suivi. Idempotent : ne remplace pas un lien déjà actif. */
export function useActiverSuivi(): UseMutationResult<string, Error, CibleSuivi> {
  return useMutationSuivi(inscriptionRepo.activerSuivi)
}

/** Fait tourner le jeton : le lien déjà distribué cesse de fonctionner. */
export function useRegenererSuivi(): UseMutationResult<string, Error, CibleSuivi> {
  return useMutationSuivi(inscriptionRepo.regenererSuivi)
}

export function useRevoquerSuivi(): UseMutationResult<void, Error, CibleSuivi> {
  return useMutationSuivi(inscriptionRepo.revoquerSuivi)
}
