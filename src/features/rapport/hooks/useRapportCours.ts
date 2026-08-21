import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'

import { coursKeys } from '@/features/cours/hooks/coursKeys'
import { inscriptionKeys } from '@/features/inscriptions/hooks/inscriptionKeys'
import { parametresKeys } from '@/features/parametres/hooks/parametresKeys'
import { seanceKeys } from '@/features/seances/hooks/seanceKeys'
import type { PeriodeRapport, RapportSession } from '@/shared/lib/rapportSession'
import { construireRapport } from '@/shared/lib/rapportSession'
import * as coursRepo from '@/shared/supabase/coursRepo'
import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'
import * as inscriptionRepo from '@/shared/supabase/inscriptionRepo'
import * as parametresRepo from '@/shared/supabase/parametresRepo'
import * as seanceRepo from '@/shared/supabase/seanceRepo'

export interface ResultatRapport {
  cours: CoursAvecDetails | null
  rapport: RapportSession | null
  isPending: boolean
  isError: boolean
  error: Error | null
}

/**
 * Charge tout ce qu'il faut au rapport d'un cours et l'assemble.
 *
 * Quatre requêtes indépendantes, donc `useQueries` : elles partent ensemble au
 * lieu de s'attendre. L'assemblage lui-même est confié à `construireRapport`,
 * module pur et testé — ce hook ne fait que brancher.
 */
export function useRapportCours(
  coursId: string | undefined,
  periode: PeriodeRapport
): ResultatRapport {
  const actif = Boolean(coursId)
  const id = coursId ?? ''

  const [cours, seances, inscrits, parametres] = useQueries({
    queries: [
      {
        queryKey: coursKeys.detail(id),
        queryFn: () => coursRepo.getById(id),
        enabled: actif,
      },
      {
        queryKey: seanceKeys.parCours(id),
        queryFn: () => seanceRepo.listAvecPresences(id),
        enabled: actif,
      },
      {
        queryKey: inscriptionKeys.parCours(id),
        queryFn: () => inscriptionRepo.listByCours(id),
        enabled: actif,
      },
      { queryKey: parametresKeys.tous, queryFn: () => parametresRepo.get() },
    ],
  })

  const donnees = seances.data
  const listeInscrits = inscrits.data
  const config = parametres.data

  const rapport = useMemo(() => {
    if (!donnees || !listeInscrits || !config) return null

    return construireRapport({
      seances: donnees.map((seance) => ({ ...seance, presence: seance.presence })),
      inscrits: listeInscrits.map((inscription) => ({
        apprenant_id: inscription.apprenant_id,
        prenom: inscription.apprenant?.prenom ?? null,
        nom: inscription.apprenant?.nom ?? null,
        note_examen: inscription.note_examen,
        examen_bareme: inscription.examen_bareme,
      })),
      config,
      periode,
    })
  }, [donnees, listeInscrits, config, periode])

  const requetes = [cours, seances, inscrits, parametres]

  return {
    cours: cours.data ?? null,
    rapport,
    isPending: actif && requetes.some((requete) => requete.isPending),
    isError: requetes.some((requete) => requete.isError),
    error: requetes.find((requete) => requete.error)?.error ?? null,
  }
}
