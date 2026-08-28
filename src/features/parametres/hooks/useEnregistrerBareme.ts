import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import { membreKeys } from '@/features/membres/hooks/useMembre'
import { parametresKeys } from '@/features/parametres/hooks/parametresKeys'
import type { Bareme } from '@/shared/lib/evaluations'
import * as membreRepo from '@/shared/supabase/membreRepo'
import type { Membre } from '@/shared/supabase/membreRepo'

/**
 * Choix du barème de récitation.
 *
 * Il s'écrit sur la ligne `membre` de l'utilisateur, pas dans les réglages du
 * centre : c'est la façon dont un enseignant note au quotidien, et chaque note
 * en conserve de toute façon une copie (`presence.note_bareme`). Le laisser
 * dans `parametres` aurait obligé à ouvrir aussi les pénalités et les
 * pondérations, qui elles relèvent du responsable (migration 0012).
 */
export function useEnregistrerBareme(): UseMutationResult<Membre, Error, Bareme> {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (bareme: Bareme) => {
      if (!user) throw new Error('Session expirée. Reconnectez-vous pour enregistrer.')

      return membreRepo.definirBareme(user.id, bareme)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: parametresKeys.tous })
      void queryClient.invalidateQueries({ queryKey: membreKeys.tous })
    },
  })
}
