import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { membreKeys } from '@/features/membres/hooks/useMembre'
import * as invitationRepo from '@/shared/supabase/invitationRepo'

export interface RachatInput {
  code: string
  nomAffiche: string
}

/**
 * Échange un code contre l'appartenance au centre. Renvoie le nom du centre
 * rejoint.
 *
 * Le succès change ce que l'utilisateur a le droit de voir : on invalide
 * **tout** le cache, et pas seulement les membres. Les listes lues avant le
 * rachat étaient vides — la RLS filtrait — et resteraient vides sinon.
 */
export function useRacheterInvitation(): UseMutationResult<string, Error, RachatInput> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ code, nomAffiche }: RachatInput) =>
      invitationRepo.racheter(code, nomAffiche),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: membreKeys.tous })
      void queryClient.invalidateQueries()
    },
  })
}
