import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { parametresKeys } from '@/features/parametres/hooks/parametresKeys'
import type { ConfigNotation } from '@/shared/lib/rapport'
import * as parametresRepo from '@/shared/supabase/parametresRepo'
import type { Parametres } from '@/shared/supabase/parametresRepo'

/**
 * Enregistre les réglages de notation. Le patch est partiel côté repository :
 * cela ne touche pas au barème de récitation, réglé juste au-dessus.
 */
export function useEnregistrerNotation(): UseMutationResult<Parametres, Error, ConfigNotation> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (config: ConfigNotation) => parametresRepo.upsert(config),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: parametresKeys.tous })
    },
  })
}
