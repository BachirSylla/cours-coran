import { abregeJour, libelleJour } from '@/features/cours/coursSchema'
import {
  detecterTousLesConflits,
  heureEnMinutes,
  type CreneauHoraire,
  type JourSemaine,
} from '@/shared/lib/conflits'
import { nombreInscrits, type CoursAvecDetails } from '@/shared/supabase/coursRepo'

/**
 * Helpers **purs** de la grille hebdomadaire (CLAUDE.md §6).
 *
 * Aucune règle métier n'est réimplémentée ici : la détection de chevauchement
 * vient de `shared/lib/conflits.ts`. Ce module se contente de traduire les
 * créneaux en coordonnées d'affichage.
 */

/** Un pixel par minute : une heure occupe 60 px. */
export const PIXELS_PAR_MINUTE = 1

/** Plage affichée quand aucun cours n'existe encore. */
export const PLAGE_PAR_DEFAUT = { debutMinutes: 7 * 60, finMinutes: 21 * 60 }

export const JOURS_ISO: JourSemaine[] = [1, 2, 3, 4, 5, 6, 7]

export interface PlageHoraire {
  debutMinutes: number
  finMinutes: number
}

/** Créneau prêt à être placé : identité + rattachement au cours. */
export interface CreneauPlanning extends CreneauHoraire {
  id: string
  cours_id: string
}

export interface BlocPlanning {
  creneauId: string
  coursId: string
  libelle: string
  typeLibelle: string | null
  lienMeet: string | null
  jour: JourSemaine
  /** `10:00` — déjà tronqué pour l'affichage. */
  heureDebut: string
  heureFin: string
  /** Position verticale en pixels, depuis le haut de la plage affichée. */
  top: number
  hauteur: number
  /** Répartition horizontale quand plusieurs créneaux se chevauchent. */
  voie: number
  nbVoies: number
  enConflit: boolean
  /** Index 1–5 de la palette `--chart-N`. */
  couleur: number
  /** Nombre d'apprenants inscrits au cours. */
  nbInscrits: number
}

/** `10:00:00` → `10:00` */
export function formaterHeure(heure: string): string {
  return heure.slice(0, 5)
}

/**
 * Plage horaire à afficher : englobe tous les créneaux, arrondie à l'heure,
 * avec une heure de marge de chaque côté. Bornée à une journée.
 */
export function calculerPlageHoraire(creneaux: readonly CreneauHoraire[]): PlageHoraire {
  if (creneaux.length === 0) return { ...PLAGE_PAR_DEFAUT }

  let minimum = Number.POSITIVE_INFINITY
  let maximum = Number.NEGATIVE_INFINITY

  for (const creneau of creneaux) {
    minimum = Math.min(minimum, heureEnMinutes(creneau.heure_debut))
    maximum = Math.max(maximum, heureEnMinutes(creneau.heure_fin))
  }

  const debutMinutes = Math.max(0, (Math.floor(minimum / 60) - 1) * 60)
  const finMinutes = Math.min(24 * 60, (Math.ceil(maximum / 60) + 1) * 60)

  return { debutMinutes, finMinutes }
}

/** Heures pleines de la plage, pour la gouttière et les traits horizontaux. */
export function heuresDeLaPlage(plage: PlageHoraire): number[] {
  const heures: number[] = []

  for (
    let heure = Math.ceil(plage.debutMinutes / 60);
    heure * 60 <= plage.finMinutes;
    heure++
  ) {
    heures.push(heure)
  }

  return heures
}

/**
 * Identifiants des créneaux impliqués dans au moins un chevauchement.
 * Toute la logique vient de `detecterTousLesConflits` (CLAUDE.md §5.1).
 */
export function idsEnConflit(creneaux: readonly CreneauPlanning[]): Set<string> {
  const ids = new Set<string>()

  for (const [a, b] of detecterTousLesConflits(creneaux)) {
    ids.add(a.id)
    ids.add(b.id)
  }

  return ids
}

/**
 * Répartit en « voies » les créneaux d'un même jour pour qu'ils ne se masquent
 * pas : chacun prend la première voie libre, et tous ceux d'un même groupe qui
 * se recouvre partagent la largeur.
 */
export function repartirEnVoies(
  creneauxDuJour: readonly CreneauPlanning[]
): Map<string, { voie: number; nbVoies: number }> {
  const resultat = new Map<string, { voie: number; nbVoies: number }>()

  const tries = [...creneauxDuJour].sort(
    (a, b) => heureEnMinutes(a.heure_debut) - heureEnMinutes(b.heure_debut)
  )

  // Un groupe = une suite de créneaux qui se recouvrent de proche en proche.
  let groupe: CreneauPlanning[] = []
  let finsDeVoies: number[] = []
  let finDuGroupe = -1

  function cloturerGroupe() {
    const nbVoies = finsDeVoies.length || 1
    for (const creneau of groupe) {
      const place = resultat.get(creneau.id)
      if (place) place.nbVoies = nbVoies
    }
    groupe = []
    finsDeVoies = []
    finDuGroupe = -1
  }

  for (const creneau of tries) {
    const debut = heureEnMinutes(creneau.heure_debut)
    const fin = heureEnMinutes(creneau.heure_fin)

    // Bornes strictes : un créneau qui commence pile à la fin du précédent
    // n'est pas un chevauchement (CLAUDE.md §5.1).
    if (groupe.length > 0 && debut >= finDuGroupe) {
      cloturerGroupe()
    }

    let voie = finsDeVoies.findIndex((finVoie) => debut >= finVoie)
    if (voie === -1) {
      voie = finsDeVoies.length
      finsDeVoies.push(fin)
    } else {
      finsDeVoies[voie] = fin
    }

    resultat.set(creneau.id, { voie, nbVoies: finsDeVoies.length })
    groupe.push(creneau)
    finDuGroupe = Math.max(finDuGroupe, fin)
  }

  cloturerGroupe()

  return resultat
}

/**
 * Couleur stable d'un cours : hash déterministe de son identifiant vers la
 * palette `--chart-1..5`. Le rouge n'en fait pas partie, il est réservé aux
 * conflits.
 */
export function couleurCours(coursId: string): number {
  let hash = 0

  for (let i = 0; i < coursId.length; i++) {
    hash = (hash * 31 + coursId.charCodeAt(i)) % 100_000
  }

  return (hash % 5) + 1
}

/** Met à plat les créneaux de tous les cours. */
export function extraireCreneaux(cours: readonly CoursAvecDetails[]): CreneauPlanning[] {
  return cours.flatMap((unCours) =>
    unCours.creneau.map((creneau) => ({
      id: creneau.id,
      cours_id: unCours.id,
      jour_semaine: creneau.jour_semaine as JourSemaine,
      heure_debut: creneau.heure_debut,
      heure_fin: creneau.heure_fin,
    }))
  )
}

/** Traduit les cours en blocs positionnés, prêts à être rendus. */
export function construireBlocs(
  cours: readonly CoursAvecDetails[],
  plage: PlageHoraire
): BlocPlanning[] {
  const creneaux = extraireCreneaux(cours)
  const conflits = idsEnConflit(creneaux)
  const parCoursId = new Map(cours.map((unCours) => [unCours.id, unCours]))

  const blocs: BlocPlanning[] = []

  for (const jour of JOURS_ISO) {
    const duJour = creneaux.filter((creneau) => creneau.jour_semaine === jour)
    const voies = repartirEnVoies(duJour)

    for (const creneau of duJour) {
      const unCours = parCoursId.get(creneau.cours_id)
      if (!unCours) continue

      const debut = heureEnMinutes(creneau.heure_debut)
      const fin = heureEnMinutes(creneau.heure_fin)
      const place = voies.get(creneau.id) ?? { voie: 0, nbVoies: 1 }

      blocs.push({
        creneauId: creneau.id,
        coursId: unCours.id,
        libelle: unCours.libelle,
        typeLibelle: unCours.type_cours?.libelle ?? null,
        lienMeet: unCours.lien_meet,
        jour,
        heureDebut: formaterHeure(creneau.heure_debut),
        heureFin: formaterHeure(creneau.heure_fin),
        top: (debut - plage.debutMinutes) * PIXELS_PAR_MINUTE,
        hauteur: (fin - debut) * PIXELS_PAR_MINUTE,
        voie: place.voie,
        nbVoies: place.nbVoies,
        enConflit: conflits.has(creneau.id),
        couleur: couleurCours(unCours.id),
        nbInscrits: nombreInscrits(unCours),
      })
    }
  }

  return blocs
}

/** Jours (ISO) portant au moins un créneau en conflit. */
export function joursEnConflit(blocs: readonly BlocPlanning[]): Set<JourSemaine> {
  return new Set(blocs.filter((bloc) => bloc.enConflit).map((bloc) => bloc.jour))
}

export { abregeJour, libelleJour }
