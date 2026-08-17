import { prochaineOccurrence, type Occurrence } from '@/shared/lib/seances'
import type { CoursPublic } from '@/shared/supabase/coursPublicSchema'

/**
 * Ce que la page publique doit annoncer — module **pur**, testable sans DOM.
 *
 * Le calcul est séparé du rendu parce que c'est là que se joue la justesse :
 * annoncer « lundi 10h » pour un cours mis en pause serait pire que de ne rien
 * annoncer du tout.
 */
export type EtatCoursPublic =
  | { type: 'prochaine'; occurrence: Occurrence }
  | { type: 'a_venir'; date: string }
  | { type: 'pause' }
  | { type: 'termine' }
  | { type: 'aucune' }

/**
 * L'ordre des tests n'est pas indifférent : un cours terminé ou en pause n'a pas
 * de « prochaine séance », même si ses créneaux hebdomadaires existent toujours.
 */
export function etatCoursPublic(cours: CoursPublic, maintenant: Date): EtatCoursPublic {
  const aujourdhui = chaineLocale(maintenant)

  // Comparaison lexicographique : valide pour des dates AAAA-MM-JJ.
  if (cours.statut === 'termine' || (cours.date_fin !== null && cours.date_fin < aujourdhui)) {
    return { type: 'termine' }
  }

  if (cours.statut === 'pause') {
    return { type: 'pause' }
  }

  if (cours.date_debut > aujourdhui) {
    return { type: 'a_venir', date: cours.date_debut }
  }

  const occurrence = prochaineOccurrence(
    cours.creneaux,
    cours.date_debut,
    cours.date_fin,
    maintenant
  )

  return occurrence ? { type: 'prochaine', occurrence } : { type: 'aucune' }
}

/**
 * Le lien de visioconférence, ou `null` s'il ne doit pas être proposé.
 *
 * La fonction SQL le masque déjà pour un cours en pause ou terminé. On le
 * refait ici : un bouton « Rejoindre » sous un message « ce cours est en pause »
 * se contredirait, et deux verrous valent mieux qu'un sur un écran public.
 */
export function lienRejoignable(cours: CoursPublic, etat: EtatCoursPublic): string | null {
  if (etat.type === 'pause' || etat.type === 'termine') return null

  return cours.lien_meet
}

/** Date locale `AAAA-MM-JJ` — jamais via UTC (décalerait d'un jour). */
function chaineLocale(instant: Date): string {
  const mois = String(instant.getMonth() + 1).padStart(2, '0')
  const jour = String(instant.getDate()).padStart(2, '0')

  return `${instant.getFullYear()}-${mois}-${jour}`
}
