import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { presenceKeys } from '@/features/seances/hooks/seanceKeys'
import * as presenceRepo from '@/shared/supabase/presenceRepo'
import type { Presence } from '@/shared/supabase/presenceRepo'

export interface DefinitionPresence {
  seanceId: string
  apprenantId: string
  present: boolean
}

/** Pointe (ou dépointe) un apprenant : upsert, donc rejouable sans doublon. */
export function useDefinirPresence(): UseMutationResult<Presence, Error, DefinitionPresence> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ seanceId, apprenantId, present }: DefinitionPresence) =>
      presenceRepo.definir(seanceId, apprenantId, present),
    onSuccess: (_presence, { seanceId, apprenantId }) => {
      void queryClient.invalidateQueries({ queryKey: presenceKeys.parSeance(seanceId) })
      void queryClient.invalidateQueries({ queryKey: presenceKeys.parApprenant(apprenantId) })
    },
  })
}
