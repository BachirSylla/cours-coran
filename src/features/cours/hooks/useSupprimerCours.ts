import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { coursKeys, creneauKeys } from '@/features/cours/hooks/coursKeys'
import * as coursRepo from '@/shared/supabase/coursRepo'

export function useSupprimerCours(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => coursRepo.remove(id),
    onSuccess: (_resultat, id) => {
      queryClient.removeQueries({ queryKey: coursKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: coursKeys.tous })
      // Les créneaux du cours sont supprimés en cascade.
      void queryClient.invalidateQueries({ queryKey: creneauKeys.tous })
    },
  })
}
