import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { parametresKeys } from '@/features/parametres/hooks/parametresKeys'
import type { Bareme } from '@/shared/lib/evaluations'
import * as parametresRepo from '@/shared/supabase/parametresRepo'
import type { Parametres } from '@/shared/supabase/parametresRepo'

export function useEnregistrerBareme(): UseMutationResult<Parametres, Error, Bareme> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (bareme: Bareme) => parametresRepo.upsert(bareme),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: parametresKeys.tous })
    },
  })
}
