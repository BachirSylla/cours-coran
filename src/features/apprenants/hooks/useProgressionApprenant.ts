import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'

import { usePresencesApprenant } from '@/features/apprenants/hooks/usePresencesApprenant'
import { useInscriptionsApprenant } from '@/features/inscriptions/hooks/useInscriptionsApprenant'
import { seanceKeys } from '@/features/seances/hooks/seanceKeys'
import { calculerProgression, type Progression } from '@/shared/lib/progression'
import * as seanceRepo from '@/shared/supabase/seanceRepo'
import type { Seance } from '@/shared/supabase/seanceRepo'

/** Un cours suivi par l'apprenant, réduit à ce qu'affiche la progression. */
export interface CoursSuivi {
  id: string
  libelle: string
  type_libelle: string | null
  format: string
}

export interface ProgressionCours {
  cours: CoursSuivi
  progression: Progression
  /** Séances retenues pour ce cours, les plus récentes en tête. */
  seances: Seance[]
}

export interface SeanceHistorique {
  seance: Seance
  cours_libelle: string
}

export interface ResultatProgression {
  progressions: ProgressionCours[]
  /** Toutes séances confondues, les plus récentes d'abord. */
  seancesRecentes: SeanceHistorique[]
  isPending: boolean
  isError: boolean
  error: Error | null
}

/**
 * Suivi pédagogique cumulé d'un apprenant (CLAUDE.md §6).
 *
 * Agrège les séances de chacun de ses cours. Pour un cours en **groupe**, une
 * séance n'est retenue que si l'apprenant n'y est pas marqué absent : une séance
 * sans ligne de présence compte comme suivie, exactement comme le défaut de la
 * colonne en base et comme l'écran de saisie.
 */
export function useProgressionApprenant(apprenantId: string | undefined): ResultatProgression {
  const requeteInscriptions = useInscriptionsApprenant(apprenantId)
  const requetePresences = usePresencesApprenant(apprenantId)

  const coursSuivis = useMemo<CoursSuivi[]>(() => {
    return (requeteInscriptions.data ?? [])
      .map((inscription) => inscription.cours)
      .filter((cours): cours is NonNullable<typeof cours> => cours !== null)
      .map((cours) => ({
        id: cours.id,
        libelle: cours.libelle,
        type_libelle: cours.type_cours?.libelle ?? null,
        format: cours.format,
      }))
  }, [requeteInscriptions.data])

  const requetesSeances = useQueries({
    queries: coursSuivis.map((cours) => ({
      queryKey: seanceKeys.parCours(cours.id),
      queryFn: () => seanceRepo.listByCours(cours.id),
    })),
  })

  const chargementSeances = requetesSeances.some((requete) => requete.isPending)
  const erreurSeances = requetesSeances.find((requete) => requete.error)?.error ?? null

  // `useQueries` renvoie un tableau d'identité nouvelle à chaque rendu : on
  // mémorise sur l'horodatage des données, qui ne bouge que si elles changent.
  const signatureSeances = requetesSeances.map((requete) => requete.dataUpdatedAt).join('|')
  const donneesSeances = requetesSeances.map((requete) => requete.data ?? [])

  const { progressions, seancesRecentes } = useMemo(() => {
    // Séances où l'apprenant est explicitement absent : à écarter des groupes.
    const absences = new Set(
      (requetePresences.data ?? [])
        .filter((presence) => !presence.present)
        .map((presence) => presence.seance_id)
    )

    const resultats: ProgressionCours[] = coursSuivis.map((cours, index) => {
      const toutes = donneesSeances[index] ?? []
      const retenues =
        cours.format === 'groupe' ? toutes.filter((seance) => !absences.has(seance.id)) : toutes

      return {
        cours,
        progression: calculerProgression(retenues, cours.type_libelle),
        seances: retenues,
      }
    })

    const historique = resultats
      .flatMap(({ cours, seances }) =>
        seances.map((seance) => ({ seance, cours_libelle: cours.libelle }))
      )
      .sort(
        (a, b) =>
          b.seance.date.localeCompare(a.seance.date) ||
          b.seance.heure_debut.localeCompare(a.seance.heure_debut)
      )

    return { progressions: resultats, seancesRecentes: historique }
    // `donneesSeances` est reconstruit à chaque rendu : c'est `signatureSeances`
    // qui porte l'information de changement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coursSuivis, requetePresences.data, signatureSeances])

  return {
    progressions,
    seancesRecentes,
    isPending: requeteInscriptions.isPending || requetePresences.isPending || chargementSeances,
    isError: requeteInscriptions.isError || requetePresences.isError || erreurSeances !== null,
    error: requeteInscriptions.error ?? requetePresences.error ?? erreurSeances,
  }
}
