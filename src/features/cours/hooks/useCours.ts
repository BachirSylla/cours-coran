import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { coursKeys } from '@/features/cours/hooks/coursKeys'
import { useSessionActive } from '@/features/sessions/hooks/useSessions'
import * as coursRepo from '@/shared/supabase/coursRepo'
import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'

/**
 * Les cours de la **session active**, avec leur type et leurs créneaux.
 *
 * La session fait partie de la clé de cache : basculer d'une session à l'autre
 * ne réutilise pas la liste précédente, et n'a pas besoin de l'invalider.
 *
 * ⚠️ La requête reste désactivée tant que la session n'est pas résolue. Partir
 * sur une chaîne vide renverrait zéro cours et afficherait « Aucun cours pour le
 * moment » à un centre qui en a neuf — un écran qui se lit comme une perte de
 * données.
 */
export function useCours(): UseQueryResult<CoursAvecDetails[], Error> {
  const { sessionId, erreur } = useSessionActive()

  return useQuery({
    queryKey: coursKeys.liste(sessionId ?? ''),
    queryFn: () => {
      /*
       * ⚠️ Si la LISTE DES SESSIONS a échoué, `sessionId` reste `undefined` et
       * la requête serait désactivée pour toujours : l'écran afficherait
       * « Chargement des cours… » indéfiniment, sans jamais passer en erreur —
       * un sablier éternel, pire qu'un message d'échec. On relaie donc l'erreur
       * de session ici, pour que les pages la voient comme la leur.
       */
      if (erreur) throw erreur
      return coursRepo.list(sessionId as string)
    },
    enabled: Boolean(sessionId) || Boolean(erreur),
  })
}

/**
 * **Tous** les cours du centre, toutes sessions confondues.
 *
 * Réservé aux écrans dont le périmètre n'est pas la session — le retrait d'un
 * membre, qui réaffecte ses cours partout. Voir `coursRepo.listToutesSessions`.
 */
export function useCoursToutesSessions(): UseQueryResult<CoursAvecDetails[], Error> {
  return useQuery({
    queryKey: coursKeys.listeGlobale(),
    queryFn: coursRepo.listToutesSessions,
  })
}
