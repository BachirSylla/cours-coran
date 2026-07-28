import { getISODay } from 'date-fns'

import type { JourSemaine } from '@/shared/lib/conflits'

/**
 * Génération des séances **au fil de l'eau** (CLAUDE.md §5.3).
 *
 * Les occurrences ne sont jamais pré-enregistrées : elles sont calculées à la
 * demande, pour la fenêtre affichée, à partir des créneaux du cours. Une ligne
 * `seance` n'existe en base qu'une fois que l'enseignant a saisi quelque chose.
 * `fusionnerAvecSeances` réunit ensuite les deux mondes.
 *
 * Module **pur** : ni Supabase, ni React, ni DOM.
 */

/** Créneau hebdomadaire source, rattaché à son cours. */
export interface CreneauSource {
  cours_id: string
  jour_semaine: JourSemaine
  heure_debut: string
  heure_fin: string
}

/** Occurrence calculée — pas encore (ou jamais) enregistrée. */
export interface Occurrence {
  cours_id: string
  /** Format `AAAA-MM-JJ`. */
  date: string
  jour_semaine: JourSemaine
  heure_debut: string
  heure_fin: string
}

/** Plage affichée. Les deux bornes sont **incluses**. */
export interface Fenetre {
  debut: string
  fin: string
}

/** Ce qu'une séance enregistrée doit exposer pour être rapprochée d'une occurrence. */
export interface SeanceRapprochable {
  cours_id: string
  date: string
  heure_debut: string
}

export interface SeanceVue<T extends SeanceRapprochable = SeanceRapprochable> {
  cours_id: string
  date: string
  jour_semaine: JourSemaine | null
  heure_debut: string
  heure_fin: string | null
  /** La ligne enregistrée, ou `null` si l'occurrence n'a pas encore été saisie. */
  seance: T | null
  saisie: boolean
  /**
   * Séance enregistrée ne correspondant à aucune occurrence : le créneau a été
   * déplacé ou supprimé depuis. Elle est conservée — l'historique ne doit pas
   * disparaître de l'écran parce que l'emploi du temps a changé.
   */
  orpheline: boolean
}

const FORMAT_DATE = /^\d{4}-\d{2}-\d{2}$/

/** `10:00:00` et `10:00` désignent le même horaire : la clé doit les confondre. */
export function normaliserHeure(heure: string): string {
  return heure.trim().slice(0, 5)
}

/**
 * Convertit `AAAA-MM-JJ` en `Date` **locale**.
 * `new Date('2026-07-28')` serait interprété en UTC et pourrait reculer d'un
 * jour selon le fuseau — ce qui décalerait tout le calendrier.
 */
export function dateDepuisChaine(date: string): Date {
  if (!FORMAT_DATE.test(date)) {
    throw new Error(`Date invalide : « ${date} » (format attendu AAAA-MM-JJ)`)
  }

  const [annee, mois, jour] = date.split('-').map(Number) as [number, number, number]

  return new Date(annee, mois - 1, jour)
}

/** Inverse de `dateDepuisChaine`, sans passer par UTC. */
export function chaineDepuisDate(date: Date): string {
  const mois = String(date.getMonth() + 1).padStart(2, '0')
  const jour = String(date.getDate()).padStart(2, '0')

  return `${date.getFullYear()}-${mois}-${jour}`
}

/** Clé fonctionnelle d'une occurrence : `cours_id|date|HH:MM`. */
export function cleOccurrence(element: SeanceRapprochable): string {
  return `${element.cours_id}|${element.date}|${normaliserHeure(element.heure_debut)}`
}

/** Compare deux occurrences : date croissante, puis heure de début. */
function comparerOccurrences(
  a: { date: string; heure_debut: string },
  b: { date: string; heure_debut: string }
): number {
  return (
    a.date.localeCompare(b.date) ||
    normaliserHeure(a.heure_debut).localeCompare(normaliserHeure(b.heure_debut))
  )
}

/**
 * Toutes les occurrences des créneaux dans la fenêtre demandée.
 *
 * L'intervalle retenu est l'intersection de la vie du cours
 * `[dateDebut, dateFin ?? ∞]` et de la fenêtre `[fenetre.debut, fenetre.fin]`,
 * **bornes incluses**. Un intervalle vide ne produit aucune occurrence.
 *
 * @param dateFin `null` tant que le cours est en cours (CLAUDE.md §5.2).
 */
export function genererOccurrences(
  creneaux: readonly CreneauSource[],
  dateDebut: string,
  dateFin: string | null,
  fenetre: Fenetre
): Occurrence[] {
  // Comparaison lexicographique : valide pour des dates AAAA-MM-JJ.
  const debut = dateDebut > fenetre.debut ? dateDebut : fenetre.debut
  const fin = dateFin !== null && dateFin < fenetre.fin ? dateFin : fenetre.fin

  if (creneaux.length === 0 || debut > fin) return []

  const premierJour = dateDepuisChaine(debut)
  const dernierJour = dateDepuisChaine(fin)
  const occurrences: Occurrence[] = []

  for (const creneau of creneaux) {
    // On avance jusqu'au premier jour de la semaine correspondant…
    const curseur = new Date(premierJour)
    const ecart = (creneau.jour_semaine - getISODay(curseur) + 7) % 7
    curseur.setDate(curseur.getDate() + ecart)

    // …puis de semaine en semaine.
    while (curseur <= dernierJour) {
      occurrences.push({
        cours_id: creneau.cours_id,
        date: chaineDepuisDate(curseur),
        jour_semaine: creneau.jour_semaine,
        heure_debut: creneau.heure_debut,
        heure_fin: creneau.heure_fin,
      })
      curseur.setDate(curseur.getDate() + 7)
    }
  }

  return occurrences.sort(comparerOccurrences)
}

/**
 * Rapproche les occurrences calculées des séances déjà enregistrées.
 *
 * Toute séance existante sans occurrence correspondante est **conservée** et
 * marquée `orpheline` : un créneau déplacé ne doit pas effacer le passé.
 */
export function fusionnerAvecSeances<T extends SeanceRapprochable>(
  occurrences: readonly Occurrence[],
  seancesExistantes: readonly T[]
): SeanceVue<T>[] {
  const parCle = new Map<string, T>()
  for (const seance of seancesExistantes) {
    parCle.set(cleOccurrence(seance), seance)
  }

  const clesUtilisees = new Set<string>()

  const vues: SeanceVue<T>[] = occurrences.map((occurrence) => {
    const cle = cleOccurrence(occurrence)
    const seance = parCle.get(cle) ?? null
    if (seance) clesUtilisees.add(cle)

    return {
      cours_id: occurrence.cours_id,
      date: occurrence.date,
      jour_semaine: occurrence.jour_semaine,
      heure_debut: occurrence.heure_debut,
      heure_fin: occurrence.heure_fin,
      seance,
      saisie: seance !== null,
      orpheline: false,
    }
  })

  for (const seance of seancesExistantes) {
    const cle = cleOccurrence(seance)
    if (clesUtilisees.has(cle)) continue

    vues.push({
      cours_id: seance.cours_id,
      date: seance.date,
      jour_semaine: null,
      heure_debut: seance.heure_debut,
      heure_fin: null,
      seance,
      saisie: true,
      orpheline: true,
    })
    clesUtilisees.add(cle)
  }

  return vues.sort(comparerOccurrences)
}
