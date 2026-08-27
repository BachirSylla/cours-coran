import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { parametresKeys } from '@/features/parametres/hooks/parametresKeys'
import * as parametresRepo from '@/shared/supabase/parametresRepo'
import type { Parametres } from '@/shared/supabase/parametresRepo'

/**
 * Enregistre le logo du centre, ou le retire en passant `null`.
 *
 * Le patch du repository est partiel : régler le logo ne touche ni au barème de
 * récitation, ni à la configuration de la notation.
 */
export function useEnregistrerLogo(): UseMutationResult<Parametres, Error, string | null> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (logo: string | null) => parametresRepo.upsert({ logo }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: parametresKeys.tous })
    },
  })
}
