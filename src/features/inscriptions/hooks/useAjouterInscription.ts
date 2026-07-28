import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { coursKeys } from '@/features/cours/hooks/coursKeys'
import { inscriptionKeys } from '@/features/inscriptions/hooks/inscriptionKeys'
import * as inscriptionRepo from '@/shared/supabase/inscriptionRepo'
import type { Inscription } from '@/shared/supabase/inscriptionRepo'

export interface AjoutInscription {
  apprenantId: string
  coursId: string
}

export function useAjouterInscription(): UseMutationResult<
  Inscription,
  Error,
  AjoutInscription
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ apprenantId, coursId }: AjoutInscription) =>
      inscriptionRepo.ajouter(apprenantId, coursId),
    onSuccess: (_inscription, { apprenantId, coursId }) => {
      void queryClient.invalidateQueries({ queryKey: inscriptionKeys.parCours(coursId) })
      void queryClient.invalidateQueries({
        queryKey: inscriptionKeys.parApprenant(apprenantId),
      })
      // La liste des cours et la grille affichent le nombre d'inscrits.
      void queryClient.invalidateQueries({ queryKey: coursKeys.tous })
    },
  })
}
