import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { presenceKeys, seanceKeys } from '@/features/seances/hooks/seanceKeys'
import * as presenceRepo from '@/shared/supabase/presenceRepo'
import type { EvaluationInput, Presence } from '@/shared/supabase/presenceRepo'

export interface NotationApprenant {
  seanceId: string
  apprenantId: string
  evaluation: EvaluationInput
}

/**
 * Enregistre l'évaluation d'un apprenant sur une séance.
 * `present` n'est pas touché : seules les colonnes envoyées sont mises à jour.
 */
export function useNoterApprenant(): UseMutationResult<Presence, Error, NotationApprenant> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ seanceId, apprenantId, evaluation }: NotationApprenant) =>
      presenceRepo.noter(seanceId, apprenantId, evaluation),
    onSuccess: (_presence, { seanceId, apprenantId }) => {
      void queryClient.invalidateQueries({ queryKey: presenceKeys.parSeance(seanceId) })
      // La fiche de l'apprenant affiche ses évaluations : elle doit suivre.
      void queryClient.invalidateQueries({ queryKey: presenceKeys.parApprenant(apprenantId) })
      // Le rapport de session lit les notes *embarquées* dans les séances.
      void queryClient.invalidateQueries({ queryKey: seanceKeys.tous })
    },
  })
}
