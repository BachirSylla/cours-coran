import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { inscriptionKeys } from '@/features/inscriptions/hooks/inscriptionKeys'
import * as inscriptionRepo from '@/shared/supabase/inscriptionRepo'
import type { ExamenInput } from '@/shared/supabase/inscriptionRepo'

export interface NotationExamen {
  inscriptionId: string
  /** Nécessaires pour invalider les deux vues de la liaison. */
  apprenantId: string
  coursId: string
  examen: ExamenInput
}

/** Note d'examen de fin de session d'un apprenant pour un cours. */
export function useNoterExamen(): UseMutationResult<void, Error, NotationExamen> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ inscriptionId, examen }: NotationExamen) =>
      inscriptionRepo.noterExamen(inscriptionId, examen),
    onSuccess: (_resultat, { apprenantId, coursId }) => {
      void queryClient.invalidateQueries({ queryKey: inscriptionKeys.parCours(coursId) })
      // La fiche de l'apprenant liste ses cours : elle doit suivre.
      void queryClient.invalidateQueries({
        queryKey: inscriptionKeys.parApprenant(apprenantId),
      })
    },
  })
}
