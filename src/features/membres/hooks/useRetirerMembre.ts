import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { coursKeys } from '@/features/cours/hooks/coursKeys'
import { membreKeys } from '@/features/membres/hooks/useMembre'
import * as membreRepo from '@/shared/supabase/membreRepo'

export interface RetraitMembre {
  userId: string
  /** Qui reprend ses cours. `null` = les laisser sans enseignant. */
  reaffecterA: string | null
}

/**
 * Retire un membre du centre et réaffecte ses cours dans le même geste.
 *
 * Invalide deux familles : les membres, évidemment, mais aussi les cours —
 * leur `enseignant_id` vient de changer, et c'est lui qui décide de ce que
 * chacun voit et peut écrire (migration 0017).
 *
 * @returns le nombre de cours déplacés.
 */
export function useRetirerMembre(): UseMutationResult<number, Error, RetraitMembre> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ userId, reaffecterA }: RetraitMembre) =>
      membreRepo.retirer(userId, reaffecterA),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: membreKeys.tous })
      void queryClient.invalidateQueries({ queryKey: coursKeys.tous })
    },
  })
}
