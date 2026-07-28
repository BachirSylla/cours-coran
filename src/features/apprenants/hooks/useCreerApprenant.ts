import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { apprenantKeys } from '@/features/apprenants/hooks/apprenantKeys'
import * as apprenantRepo from '@/shared/supabase/apprenantRepo'
import type { Apprenant, ApprenantInput } from '@/shared/supabase/apprenantRepo'

export function useCreerApprenant(): UseMutationResult<Apprenant, Error, ApprenantInput> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ApprenantInput) => apprenantRepo.create(input),
    onSuccess: (apprenant) => {
      queryClient.setQueryData(apprenantKeys.detail(apprenant.id), apprenant)
      void queryClient.invalidateQueries({ queryKey: apprenantKeys.liste() })
    },
  })
}
