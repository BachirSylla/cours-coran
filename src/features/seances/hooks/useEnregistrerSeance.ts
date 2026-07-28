import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { seanceKeys } from '@/features/seances/hooks/seanceKeys'
import * as seanceRepo from '@/shared/supabase/seanceRepo'
import type { Seance, SeanceInput } from '@/shared/supabase/seanceRepo'

/**
 * Enregistre une séance — création à la première saisie, mise à jour ensuite.
 * L'appelant n'a pas à savoir laquelle des deux : le repo fait un upsert sur
 * `(cours_id, date, heure_debut)`.
 */
export function useEnregistrerSeance(): UseMutationResult<Seance, Error, SeanceInput> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: SeanceInput) => seanceRepo.upsert(input),
    onSuccess: () => {
      // Une séance apparaît dans la semaine affichée comme dans la fiche du
      // cours : on invalide toute la famille.
      void queryClient.invalidateQueries({ queryKey: seanceKeys.tous })
    },
  })
}
