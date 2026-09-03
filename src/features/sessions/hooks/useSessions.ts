import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'

import { useSessionActiveStore } from '@/features/sessions/sessionActiveStore'
import * as sessionRepo from '@/shared/supabase/sessionRepo'
import type { Session, SessionInput } from '@/shared/supabase/sessionRepo'

export const sessionKeys = {
  tous: ['sessions'] as const,
  liste: () => [...sessionKeys.tous, 'liste'] as const,
}

/** Toutes les sessions du centre, la plus récente en tête. */
export function useSessions(): UseQueryResult<Session[], Error> {
  return useQuery({
    queryKey: sessionKeys.liste(),
    queryFn: sessionRepo.list,
    // Une session change rarement : inutile de la redemander à chaque écran.
    staleTime: 5 * 60_000,
  })
}

export interface SessionActive {
  session: Session | null
  /** `undefined` tant que les sessions ne sont pas chargées — jamais `null` par défaut. */
  sessionId: string | undefined
  sessions: Session[]
  chargement: boolean
  /**
   * Échec du chargement des sessions. Sans lui, tout ce qui dépend de la
   * session resterait en attente pour toujours : `sessionId` ne devient jamais
   * défini, la requête filtrée ne part pas, et l'écran ne dit rien.
   */
  erreur: Error | null
  choisir: (id: string) => void
  /** Un centre qui n'a jamais créé de session n'en voit qu'une : pas de sélecteur. */
  plusieurs: boolean
}

/**
 * La session courante, résolue.
 *
 * La préférence enregistrée ne fait pas foi : si elle désigne une session que la
 * base ne renvoie pas — supprimée, ou d'un centre qu'on a quitté — on retombe
 * sur la première de la liste plutôt que de filtrer sur un identifiant fantôme,
 * ce qui afficherait une application vide sans rien expliquer.
 *
 * ⚠️ `sessionId` reste `undefined` pendant le chargement, et non `null` : les
 * requêtes filtrées doivent attendre, pas partir sur « aucune session ».
 */
export function useSessionActive(): SessionActive {
  const { data: sessions, isPending, error } = useSessions()
  const id = useSessionActiveStore((etat) => etat.id)
  const choisir = useSessionActiveStore((etat) => etat.choisir)

  const liste = useMemo(() => sessions ?? [], [sessions])

  const session = useMemo(() => {
    if (liste.length === 0) return null
    return liste.find((candidate) => candidate.id === id) ?? liste[0] ?? null
  }, [liste, id])

  return {
    session,
    sessionId: isPending ? undefined : (session?.id ?? undefined),
    sessions: liste,
    chargement: isPending,
    erreur: error,
    choisir,
    plusieurs: liste.length > 1,
  }
}

/** Crée une session. Réservée au responsable — la RLS le fait respecter. */
export function useCreerSession(): UseMutationResult<Session, Error, SessionInput> {
  const queryClient = useQueryClient()
  const choisir = useSessionActiveStore((etat) => etat.choisir)

  return useMutation({
    mutationFn: sessionRepo.creer,
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.tous })
      // On bascule dessus : personne ne crée une session pour rester ailleurs.
      choisir(session.id)
    },
  })
}
