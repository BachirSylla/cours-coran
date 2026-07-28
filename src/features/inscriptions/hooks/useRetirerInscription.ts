import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { coursKeys } from '@/features/cours/hooks/coursKeys'
import { inscriptionKeys } from '@/features/inscriptions/hooks/inscriptionKeys'
import * as inscriptionRepo from '@/shared/supabase/inscriptionRepo'

export interface RetraitInscription {
  inscriptionId: string
  /** Nécessaires pour invalider les deux vues de la liaison. */
  apprenantId: string
  coursId: string
}

export function useRetirerInscription(): UseMutationResult<void, Error, RetraitInscription> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ inscriptionId }: RetraitInscription) =>
      inscriptionRepo.retirer(inscriptionId),
    onSuccess: (_resultat, { apprenantId, coursId }) => {
      void queryClient.invalidateQueries({ queryKey: inscriptionKeys.parCours(coursId) })
      void queryClient.invalidateQueries({
        queryKey: inscriptionKeys.parApprenant(apprenantId),
      })
      void queryClient.invalidateQueries({ queryKey: coursKeys.tous })
    },
  })
}
