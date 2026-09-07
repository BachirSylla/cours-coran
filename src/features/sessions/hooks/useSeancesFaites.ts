import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import * as tableauDeBordRepo from '@/shared/supabase/tableauDeBordRepo'

export const seancesFaitesKeys = {
  tous: ['seances-faites'] as const,
  session: (sessionId: string) => [...seancesFaitesKeys.tous, sessionId] as const,
}

/**
 * Combien de séances ont réellement eu lieu, cours par cours, dans une session
 * (migration 0028).
 *
 * ⚠️ Le compte vient d'une agrégation SQL, jamais d'une liste rapatriée :
 * PostgREST coupe à `max_rows` sans rien dire, et un centre actif aurait vu son
 * compteur devenir faux en silence.
 *
 * Rend une table `cours_id → nombre`. Un cours **absent** n'a tenu aucune
 * séance : lire `?? 0` est la bonne façon de l'interpréter, et le `group by` ne
 * fabrique pas de ligne vide.
 */
export function useSeancesFaites(sessionId: string | null): {
  parCours: ReadonlyMap<string, number>
  isPending: boolean
  isError: boolean
} {
  const requete = useQuery({
    queryKey: seancesFaitesKeys.session(sessionId ?? ''),
    queryFn: () => tableauDeBordRepo.listSeancesFaites(sessionId as string),
    enabled: Boolean(sessionId),
  })

  const parCours = useMemo(
    () => new Map((requete.data ?? []).map((ligne) => [ligne.cours_id, ligne.faites])),
    [requete.data]
  )

  return {
    parCours,
    // `enabled: false` n'est jamais résolu : sans ce garde, l'écran resterait en
    // chargement pour toujours quand aucune session n'est visée.
    isPending: Boolean(sessionId) && requete.isPending,
    isError: requete.isError,
  }
}
