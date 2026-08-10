import { useMemo } from 'react'

import { usePresencesApprenant } from '@/features/apprenants/hooks/usePresencesApprenant'
import { noteEnPourcentage, tendance, type Tendance } from '@/shared/lib/evaluations'

/** Une évaluation lisible : ce qui a été récité, quand, et comment. */
export interface EvaluationLisible {
  id: string
  date: string
  note: number
  note_bareme: number
  pourcentage: number
  commentaire: string | null
  passage_evalue: string | null
}

export interface EvolutionCours {
  cours_id: string
  cours_libelle: string
  evaluations: EvaluationLisible[]
  tendance: Tendance
}

export interface ResultatEvaluations {
  parCours: EvolutionCours[]
  total: number
  isPending: boolean
  isError: boolean
  error: Error | null
}

/**
 * Évaluations d'un apprenant, groupées par cours et ordonnées dans le temps.
 *
 * Seules les lignes réellement notées comptent : une présence sans note n'est
 * pas une évaluation. Le calcul de tendance est délégué au module pur
 * `shared/lib/evaluations.ts`.
 */
export function useEvaluationsApprenant(apprenantId: string | undefined): ResultatEvaluations {
  const requete = usePresencesApprenant(apprenantId)
  const presences = requete.data

  const { parCours, total } = useMemo(() => {
    const groupes = new Map<string, EvolutionCours>()
    let compte = 0

    for (const presence of presences ?? []) {
      const seance = presence.seance
      if (!seance || presence.note === null || presence.note_bareme === null) continue

      const note = Number(presence.note)
      if (!Number.isFinite(note)) continue

      compte += 1

      const existant = groupes.get(seance.cours_id) ?? {
        cours_id: seance.cours_id,
        cours_libelle: seance.cours?.libelle ?? 'Cours supprimé',
        evaluations: [],
        tendance: 'insuffisant' as Tendance,
      }

      existant.evaluations.push({
        id: presence.id,
        date: seance.date,
        note,
        note_bareme: presence.note_bareme,
        pourcentage: noteEnPourcentage(note, presence.note_bareme),
        commentaire: presence.commentaire,
        passage_evalue: presence.passage_evalue,
      })

      groupes.set(seance.cours_id, existant)
    }

    const resultats = [...groupes.values()].map((groupe) => {
      const evaluations = groupe.evaluations.sort((a, b) => a.date.localeCompare(b.date))

      return { ...groupe, evaluations, tendance: tendance(evaluations) }
    })

    resultats.sort((a, b) => a.cours_libelle.localeCompare(b.cours_libelle, 'fr'))

    return { parCours: resultats, total: compte }
  }, [presences])

  return {
    parCours,
    total,
    isPending: requete.isPending,
    isError: requete.isError,
    error: requete.error,
  }
}
