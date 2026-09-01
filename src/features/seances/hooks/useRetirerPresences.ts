import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { presenceKeys, seanceKeys } from '@/features/seances/hooks/seanceKeys'
import * as presenceRepo from '@/shared/supabase/presenceRepo'

/**
 * Retire tous les pointages d'une séance — **notes comprises**.
 *
 * C'est la sortie du refus opposé par la base quand on veut faire quitter à une
 * séance le statut « faite » alors qu'elle porte des présences (migration
 * 0020). Le refus est volontaire : supprimer du travail saisi n'est pas une
 * décision qu'un trigger doit prendre à la place de quelqu'un.
 *
 * L'invalidation ne peut pas viser un apprenant en particulier — plusieurs sont
 * concernés — donc elle porte sur toute la famille des présences.
 */
export function useRetirerPresences(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (seanceId: string) => presenceRepo.removeBySeance(seanceId),
    onSuccess: (_resultat, seanceId) => {
      void queryClient.invalidateQueries({ queryKey: presenceKeys.parSeance(seanceId) })
      void queryClient.invalidateQueries({ queryKey: presenceKeys.tous })
      // Le rapport de session lit les présences embarquées dans les séances.
      void queryClient.invalidateQueries({ queryKey: seanceKeys.tous })
    },
  })
}
