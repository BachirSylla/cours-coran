import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { paiementKeys } from '@/features/paiements/hooks/paiementKeys'
import * as paiementRepo from '@/shared/supabase/paiementRepo'
import type { Paiement, PaiementInput } from '@/shared/supabase/paiementRepo'

/**
 * Enregistre un règlement — création la première fois, mise à jour ensuite,
 * grâce à l'upsert sur `(cours_id, mois_concerne)`.
 */
export function useEnregistrerPaiement(): UseMutationResult<Paiement, Error, PaiementInput> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: PaiementInput) => paiementRepo.upsert(input),
    onSuccess: () => {
      // Un règlement apparaît dans le mois affiché comme dans la fiche du cours.
      void queryClient.invalidateQueries({ queryKey: paiementKeys.tous })
    },
  })
}
