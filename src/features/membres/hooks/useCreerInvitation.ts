import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { invitationKeys } from '@/features/membres/hooks/invitationKeys'
import * as invitationRepo from '@/shared/supabase/invitationRepo'

/**
 * Génère une invitation et renvoie le code en clair — sa seule apparition.
 * L'appelant doit l'afficher immédiatement : il ne se retrouve pas.
 */
export function useCreerInvitation(): UseMutationResult<string, Error, number | undefined> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (jours?: number) => invitationRepo.creer(jours ?? 7),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: invitationKeys.tous })
    },
  })
}
