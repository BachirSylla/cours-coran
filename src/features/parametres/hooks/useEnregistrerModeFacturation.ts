import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { parametresKeys } from '@/features/parametres/hooks/parametresKeys'
import { reglementKeys } from '@/features/paiements/hooks/useReglements'
import type { ModeFacturation } from '@/shared/lib/facturation'
import * as parametresRepo from '@/shared/supabase/parametresRepo'
import type { Parametres } from '@/shared/supabase/parametresRepo'

/**
 * Enregistre le rythme de facturation du centre (migration 0026).
 *
 * ⚠️ Invalide AUSSI les règlements : le mode décide de ce qui est dû, donc un
 * tableau calculé sous l'ancien mode devient faux à la seconde où il change.
 * Sans cela, le responsable verrait des mois facturés dans un centre passé au
 * forfait, jusqu'au prochain rechargement.
 *
 * Le patch est partiel côté repository : le barème, le logo et la notation ne
 * sont pas touchés.
 */
export function useEnregistrerModeFacturation(): UseMutationResult<
  Parametres,
  Error,
  ModeFacturation
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (mode: ModeFacturation) => parametresRepo.upsert({ mode_facturation: mode }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: parametresKeys.tous })
      void queryClient.invalidateQueries({ queryKey: reglementKeys.tous })
    },
  })
}
