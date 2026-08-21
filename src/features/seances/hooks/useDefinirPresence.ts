import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { presenceKeys } from '@/features/seances/hooks/seanceKeys'
import type { EtatPresence } from '@/shared/lib/rapport'
import * as presenceRepo from '@/shared/supabase/presenceRepo'
import type { Presence } from '@/shared/supabase/presenceRepo'

export interface DefinitionPresence {
  seanceId: string
  apprenantId: string
  etat: EtatPresence
}

/**
 * Pointe un apprenant : upsert, donc rejouable sans doublon.
 *
 * L'état est la seule entrée — la case à cocher envoie `present` ou `absent`,
 * le sélecteur envoie la nuance. Le repository en déduit le booléen `present`,
 * de sorte que les deux colonnes ne peuvent pas se contredire.
 */
export function useDefinirPresence(): UseMutationResult<Presence, Error, DefinitionPresence> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ seanceId, apprenantId, etat }: DefinitionPresence) =>
      presenceRepo.definirEtat(seanceId, apprenantId, etat),
    onSuccess: (_presence, { seanceId, apprenantId }) => {
      void queryClient.invalidateQueries({ queryKey: presenceKeys.parSeance(seanceId) })
      void queryClient.invalidateQueries({ queryKey: presenceKeys.parApprenant(apprenantId) })
    },
  })
}
