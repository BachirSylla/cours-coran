import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { coursKeys, creneauKeys } from '@/features/cours/hooks/coursKeys'
import type { EnregistrementCours } from '@/features/cours/hooks/useCreerCours'
import * as coursRepo from '@/shared/supabase/coursRepo'
import type { Cours } from '@/shared/supabase/coursRepo'

export interface ModificationCours extends EnregistrementCours {
  id: string
}

export function useModifierCours(): UseMutationResult<Cours, Error, ModificationCours> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, cours, creneaux }: ModificationCours) =>
      coursRepo.update(id, cours, creneaux),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coursKeys.tous })
      void queryClient.invalidateQueries({ queryKey: creneauKeys.tous })
    },
  })
}
