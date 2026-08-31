import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { coursKeys } from '@/features/cours/hooks/coursKeys'
import type { SurchargesCours } from '@/shared/lib/paramsCours'
import * as coursRepo from '@/shared/supabase/coursRepo'

export interface ReglagesCours {
  coursId: string
  surcharges: SurchargesCours
}

/**
 * Enregistre les réglages propres à un cours. `null` sur un champ signifie
 * « hériter du centre ».
 *
 * Invalide toute la famille `coursKeys` : le rapport lit ces colonnes, la fiche
 * les affiche, et la liste les transporte.
 */
export function useDefinirReglagesCours(): UseMutationResult<void, Error, ReglagesCours> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ coursId, surcharges }: ReglagesCours) =>
      coursRepo.definirReglages(coursId, surcharges),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coursKeys.tous })
    },
  })
}
