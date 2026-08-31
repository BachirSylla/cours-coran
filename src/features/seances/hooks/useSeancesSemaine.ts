import { useMemo } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { useCours } from '@/features/cours/hooks/useCours'
import { seanceKeys } from '@/features/seances/hooks/seanceKeys'
import type { SeanceVueEnrichie } from '@/features/seances/regroupement'
import type { JourSemaine } from '@/shared/lib/conflits'
import { fusionnerAvecSeances, genererOccurrences } from '@/shared/lib/seances'
import * as seanceRepo from '@/shared/supabase/seanceRepo'
import type { Seance } from '@/shared/supabase/seanceRepo'

/** Séances enregistrées sur une plage de dates (bornes incluses). */
export function useSeancesEntre(debut: string, fin: string): UseQueryResult<Seance[], Error> {
  return useQuery({
    queryKey: seanceKeys.plage(debut, fin),
    queryFn: () => seanceRepo.listBetween(debut, fin),
  })
}

export interface ResultatSeancesSemaine {
  vues: SeanceVueEnrichie[]
  isPending: boolean
  isError: boolean
  error: Error | null
}

/**
 * Séances de la semaine : occurrences calculées au fil de l'eau (CLAUDE.md §5.3)
 * fusionnées avec ce qui est déjà enregistré.
 *
 * Seuls les cours **actifs** produisent des occurrences : un cours en pause ou
 * terminé ne doit plus remplir la semaine de lignes à saisir. Ses séances déjà
 * saisies restent visibles — elles remontent par la fusion, en « hors planning ».
 */
export function useSeancesSemaine(debut: string, fin: string): ResultatSeancesSemaine {
  const requeteCours = useCours()
  const requeteSeances = useSeancesEntre(debut, fin)

  const cours = requeteCours.data
  const seances = requeteSeances.data

  const vues = useMemo<SeanceVueEnrichie[]>(() => {
    if (!cours || !seances) return []

    const parCoursId = new Map(cours.map((unCours) => [unCours.id, unCours]))

    // genererOccurrences raisonne sur un seul cours (sa plage de vie lui est
    // propre) : on boucle, puis on fusionne l'ensemble en une fois.
    const occurrences = cours
      .filter((unCours) => unCours.statut === 'actif')
      .flatMap((unCours) =>
        genererOccurrences(
          unCours.creneau.map((creneau) => ({
            cours_id: unCours.id,
            jour_semaine: creneau.jour_semaine as JourSemaine,
            heure_debut: creneau.heure_debut,
            heure_fin: creneau.heure_fin,
          })),
          unCours.date_debut,
          unCours.date_fin,
          { debut, fin }
        )
      )

    return fusionnerAvecSeances(occurrences, seances).map((vue) => {
      const unCours = parCoursId.get(vue.cours_id)

      return {
        ...vue,
        cours_libelle: unCours?.libelle ?? 'Cours supprimé',
        type_libelle: unCours?.type_cours?.libelle ?? null,
        format: unCours?.format ?? 'individuel',
        enseignant_id: unCours?.enseignant_id ?? null,
      }
    })
  }, [cours, seances, debut, fin])

  return {
    vues,
    isPending: requeteCours.isPending || requeteSeances.isPending,
    isError: requeteCours.isError || requeteSeances.isError,
    error: requeteCours.error ?? requeteSeances.error,
  }
}
