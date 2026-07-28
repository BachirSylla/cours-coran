import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { apprenantKeys } from '@/features/apprenants/hooks/apprenantKeys'
import * as apprenantRepo from '@/shared/supabase/apprenantRepo'

export function useSupprimerApprenant(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => apprenantRepo.remove(id),
    onSuccess: (_resultat, id) => {
      queryClient.removeQueries({ queryKey: apprenantKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: apprenantKeys.liste() })
    },
  })
}
