import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { coursKeys, creneauKeys } from '@/features/cours/hooks/coursKeys'
import * as coursRepo from '@/shared/supabase/coursRepo'
import type { Cours, CoursInput, CreneauInput } from '@/shared/supabase/coursRepo'

export interface EnregistrementCours {
  cours: CoursInput
  creneaux: CreneauInput[]
}

export function useCreerCours(): UseMutationResult<Cours, Error, EnregistrementCours> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ cours, creneaux }: EnregistrementCours) => coursRepo.create(cours, creneaux),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coursKeys.tous })
      // Les créneaux changent aussi : c'est la base de la détection de conflit.
      void queryClient.invalidateQueries({ queryKey: creneauKeys.tous })
    },
  })
}
