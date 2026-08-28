import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { invitationKeys } from '@/features/membres/hooks/invitationKeys'
import * as invitationRepo from '@/shared/supabase/invitationRepo'

export function useRevoquerInvitation(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => invitationRepo.revoquer(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: invitationKeys.tous })
    },
  })
}
