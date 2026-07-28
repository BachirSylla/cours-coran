import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { apprenantKeys } from '@/features/apprenants/hooks/apprenantKeys'
import * as apprenantRepo from '@/shared/supabase/apprenantRepo'
import type { Apprenant, ApprenantPatch } from '@/shared/supabase/apprenantRepo'

export interface ModificationApprenant {
  id: string
  patch: ApprenantPatch
}

export function useModifierApprenant(): UseMutationResult<
  Apprenant,
  Error,
  ModificationApprenant
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, patch }: ModificationApprenant) => apprenantRepo.update(id, patch),
    onSuccess: (apprenant) => {
      queryClient.setQueryData(apprenantKeys.detail(apprenant.id), apprenant)
      void queryClient.invalidateQueries({ queryKey: apprenantKeys.liste() })
    },
  })
}
