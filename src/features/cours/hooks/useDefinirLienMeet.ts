import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { coursKeys } from '@/features/cours/hooks/coursKeys'
import * as coursRepo from '@/shared/supabase/coursRepo'

export interface LienMeetCours {
  coursId: string
  lien: string | null
}

/**
 * Lien de visioconférence d'un cours — l'enseignant qui l'assure (0017).
 *
 * Invalide toute la famille `coursKeys` : la grille du planning et la page
 * publique du cours affichent ce lien.
 */
export function useDefinirLienMeet(): UseMutationResult<void, Error, LienMeetCours> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ coursId, lien }: LienMeetCours) => coursRepo.definirLienMeet(coursId, lien),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coursKeys.tous })
    },
  })
}
