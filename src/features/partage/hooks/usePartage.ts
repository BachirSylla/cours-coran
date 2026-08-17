import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { coursKeys } from '@/features/cours/hooks/coursKeys'
import * as coursRepo from '@/shared/supabase/coursRepo'

/**
 * Activation, rotation et révocation du lien public d'un cours.
 *
 * Les trois mutations invalident `coursKeys` : le jeton vit sur la ligne
 * `cours`, donc la fiche comme la liste doivent refléter l'état du partage.
 */
function useMutationPartage<T>(
  action: (coursId: string) => Promise<T>
): UseMutationResult<T, Error, string> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: action,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coursKeys.tous })
    },
  })
}

/** Active le partage. Idempotent : ne remplace pas un lien déjà actif. */
export function useActiverPartage(): UseMutationResult<string, Error, string> {
  return useMutationPartage(coursRepo.activerPartage)
}

/** Fait tourner le jeton : le lien déjà distribué cesse de fonctionner. */
export function useRegenererPartage(): UseMutationResult<string, Error, string> {
  return useMutationPartage(coursRepo.regenererToken)
}

export function useDesactiverPartage(): UseMutationResult<void, Error, string> {
  return useMutationPartage(coursRepo.desactiverPartage)
}
