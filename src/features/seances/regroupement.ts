import { getISODay } from 'date-fns'

import { LIBELLES_STATUT_SEANCE, type StatutSeance } from '@/features/seances/seanceSchema'
import type { JourSemaine } from '@/shared/lib/conflits'
import { dateDepuisChaine, type SeanceVue } from '@/shared/lib/seances'
import type { Seance } from '@/shared/supabase/seanceRepo'

/**
 * Regroupement des séances par journée — helper **pur** de l'écran hebdomadaire.
 * Aucune dépendance à React ni à Supabase.
 */

/** Vue de séance enrichie de ce qu'il faut pour l'afficher. */
export interface SeanceVueEnrichie extends SeanceVue<Seance> {
  cours_libelle: string
  type_libelle: string | null
  format: string
  /**
   * Enseignant affecté au cours. Saisir une séance lui revient (migration
   * 0017) : sans cette information, l'écran hebdomadaire proposerait la saisie
   * à un responsable dont la RLS refuserait ensuite l'enregistrement.
   */
  enseignant_id: string | null
  /**
   * Session du cours (migration 0022). Une session clôturée n'accepte plus de
   * séance ni de note : sans cette information, l'écran tendrait un formulaire
   * que la base refuserait (P0062).
   */
  session_id: string
}

export interface GroupeJour {
  date: string
  jour_semaine: JourSemaine
  vues: SeanceVueEnrichie[]
}

/**
 * Regroupe les vues par date, en conservant l'ordre chronologique.
 * Les journées sans séance ne produisent pas de groupe.
 */
export function grouperParJour(vues: readonly SeanceVueEnrichie[]): GroupeJour[] {
  const groupes = new Map<string, GroupeJour>()

  for (const vue of vues) {
    let groupe = groupes.get(vue.date)

    if (!groupe) {
      groupe = {
        date: vue.date,
        // Une vue orpheline n'a pas de jour_semaine : on le déduit de sa date.
        jour_semaine:
          vue.jour_semaine ?? (getISODay(dateDepuisChaine(vue.date)) as JourSemaine),
        vues: [],
      }
      groupes.set(vue.date, groupe)
    }

    groupe.vues.push(vue)
  }

  return [...groupes.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** Libellé affiché dans le badge de statut d'une ligne. */
export function libelleStatutSeance(vue: SeanceVue<Seance>): string {
  if (vue.orpheline) return 'Hors planning'
  if (!vue.saisie || !vue.seance) return 'À saisir'

  const statut = vue.seance.statut

  return statut in LIBELLES_STATUT_SEANCE
    ? LIBELLES_STATUT_SEANCE[statut as StatutSeance]
    : statut
}
