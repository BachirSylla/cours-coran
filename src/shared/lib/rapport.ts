import {
  moyennePourcentage,
  noteEnPourcentage,
  type NoteAvecBareme,
} from '@/shared/lib/evaluations'

/**
 * Rapport de session : comptage de présence et composition de la note finale.
 *
 * La note finale est **toujours sur 20**, quelle que soit la valeur de
 * `parametres.note_bareme` — ce dernier ne concerne que les notes de récitation
 * données séance par séance. Elle se compose de deux parts qui se partagent ce
 * total : l'examen de fin de session, et l'assiduité.
 *
 * Module **pur** : ni Supabase, ni React, ni DOM.
 */

/** États de présence — miroir du `check` de `presence.etat` (migration 0008). */
export const ETATS_PRESENCE = ['present', 'retard', 'absent', 'excuse', 'partiel'] as const

export type EtatPresence = (typeof ETATS_PRESENCE)[number]

export const LIBELLES_ETAT: Record<EtatPresence, string> = {
  present: 'Présent',
  retard: 'En retard',
  absent: 'Absent',
  excuse: 'Absent (excusé)',
  partiel: 'Présence partielle',
}

/**
 * Une ligne de présence telle qu'elle sort de la base.
 *
 * Les **deux** champs sont nécessaires : `etat` vaut `null` sur toutes les
 * lignes écrites avant la migration 0008, et le comptage retombe alors sur le
 * booléen. C'est ce qui rend la nouveauté rétrocompatible.
 */
export interface LignePresence {
  etat: string | null
  present: boolean
}

export interface ComptagePresence {
  /** `present` + `retard` + `partiel` : l'apprenant était là. */
  presences: number
  /** `absent` + `excuse` : l'apprenant n'était pas là, excusé ou non. */
  absences: number
  retards: number
  /** Sous-ensemble d'`absences` — affiché à part, et pénalisé ou non (config). */
  excusees: number
  /** Sous-ensemble de `presences`. Jamais pénalisé. */
  partiels: number
  total: number
}

/**
 * Configuration de la notation — mêmes noms qu'en base, pour qu'aucune couche de
 * conversion ne s'intercale entre le repository et ce module.
 */
export interface ConfigNotation {
  bareme_academique: number
  bareme_assiduite: number
  penalite_absence: number
  penalite_retard: number
  penaliser_absences_excusees: boolean
}

/**
 * Miroir exact des valeurs par défaut de `parametres` (migration 0008).
 *
 * La duplication est voulue : aucune ligne `parametres` n'existe tant que
 * l'enseignant n'a rien réglé (persistance paresseuse), donc le client doit
 * savoir sur quoi retomber. Un test fige ces valeurs — c'est le seul garde-fou
 * contre une dérive silencieuse avec le SQL.
 */
export const NOTATION_PAR_DEFAUT: ConfigNotation = {
  bareme_academique: 17,
  bareme_assiduite: 3,
  penalite_absence: 0.5,
  penalite_retard: 0.25,
  penaliser_absences_excusees: false,
}

/** Deux décimales : sans quoi `17 / 20 × 17` sortirait en 14.449999999999999. */
function arrondir(valeur: number): number {
  return Math.round(valeur * 100) / 100
}

function estEtatConnu(etat: string | null): etat is EtatPresence {
  return etat !== null && (ETATS_PRESENCE as readonly string[]).includes(etat)
}

/**
 * L'apprenant était-il là ? Classification tenue **à un seul endroit** : le
 * repository s'en sert aussi pour garder `presence.present` cohérent avec
 * `presence.etat` (CLAUDE.md §3).
 */
export function estPresent(etat: EtatPresence): boolean {
  return etat === 'present' || etat === 'retard' || etat === 'partiel'
}

/** État effectif d'une ligne : le sien, ou celui déduit du booléen historique. */
export function etatEffectif(ligne: LignePresence): EtatPresence {
  if (estEtatConnu(ligne.etat)) return ligne.etat

  return ligne.present ? 'present' : 'absent'
}

/**
 * Répartit des lignes de présence par état.
 *
 * **Précondition** : ne passer que les présences de séances réellement tenues.
 * `seance.statut` vaut aussi `annulee` et `reportee` — pénaliser un apprenant
 * pour une séance que l'enseignant a lui-même annulée serait un contresens. Le
 * filtre appartient à la requête, pas à ce calcul.
 */
export function compterPresence(lignes: readonly LignePresence[]): ComptagePresence {
  const comptage: ComptagePresence = {
    presences: 0,
    absences: 0,
    retards: 0,
    excusees: 0,
    partiels: 0,
    total: lignes.length,
  }

  for (const ligne of lignes) {
    const etat = etatEffectif(ligne)

    if (estPresent(etat)) comptage.presences += 1
    else comptage.absences += 1

    if (etat === 'retard') comptage.retards += 1
    if (etat === 'excuse') comptage.excusees += 1
    if (etat === 'partiel') comptage.partiels += 1
  }

  return comptage
}

/**
 * Absences qui coûtent réellement des points.
 *
 * Par défaut, une absence excusée n'en retire aucun : c'est précisément ce qui
 * donne un sens à la marquer plutôt que de la compter comme une absence sèche.
 * Le réglage inverse reste possible (`penaliser_absences_excusees`).
 */
export function absencesPenalisees(comptage: ComptagePresence, config: ConfigNotation): number {
  return config.penaliser_absences_excusees
    ? comptage.absences
    : comptage.absences - comptage.excusees
}

/**
 * Note d'assiduité, sur `bareme_assiduite`.
 *
 * Toujours calculable — contrairement à la note académique, l'assiduité ne
 * dépend d'aucune saisie manquante. Bornée à `[0, bareme_assiduite]` : une
 * année catastrophique donne 0, jamais un négatif qui viendrait rogner la part
 * académique.
 */
export function noteAssiduite(comptage: ComptagePresence, config: ConfigNotation): number {
  const retrait =
    absencesPenalisees(comptage, config) * config.penalite_absence +
    comptage.retards * config.penalite_retard

  const note = config.bareme_assiduite - retrait

  return arrondir(Math.min(Math.max(note, 0), config.bareme_assiduite))
}

/**
 * Note d'examen ramenée sur `maxAcademique`, ou `null` si l'examen n'a pas eu
 * lieu. `null` et non 0 : un apprenant pas encore examiné n'a pas échoué, et
 * imprimer « 0/17 » sur son rapport serait faux.
 */
export function noteAcademique(
  examen: number | null,
  examenBareme: number | null,
  maxAcademique: number
): number | null {
  if (examen === null || examenBareme === null) return null
  if (!Number.isFinite(maxAcademique) || maxAcademique < 0) return null

  return arrondir((noteEnPourcentage(examen, examenBareme) / 100) * maxAcademique)
}

/** Note finale sur 20 : académique + assiduité. `null` tant qu'il n'y a pas d'examen. */
export function noteFinale(
  examen: number | null,
  examenBareme: number | null,
  comptage: ComptagePresence,
  config: ConfigNotation
): number | null {
  const academique = noteAcademique(examen, examenBareme, config.bareme_academique)

  if (academique === null) return null

  return arrondir(academique + noteAssiduite(comptage, config))
}

/**
 * Moyenne des notes de séance, ramenée sur `baremeCible`.
 *
 * Chaque note porte **son** barème (migration 0006), donc la moyenne passe par
 * le pourcentage : un historique mêlant des /10 et des /20 reste juste, là où
 * une moyenne des notes brutes lirait un 8/10 comme un 8/20.
 */
export function moyenneRevisions(
  notes: readonly NoteAvecBareme[],
  baremeCible = 20
): number | null {
  const pourcentage = moyennePourcentage(notes)

  if (pourcentage === null) return null

  return arrondir((pourcentage / 100) * baremeCible)
}

/** Ce qu'il faut d'une séance pour en décrire le contenu évalué. */
export interface ContenuSeance {
  /** Format `AAAA-MM-JJ`. */
  date: string
  sourate: string | null
  versets_de: number | null
  versets_a: number | null
  contenu_aborde: string | null
}

function estRenseigne(texte: string | null): texte is string {
  return texte !== null && texte.trim() !== ''
}

/** `2026-08-17` → `17/08/2026`. */
function formaterDate(date: string): string {
  const [annee, mois, jour] = date.split('-')

  return annee && mois && jour ? `${jour}/${mois}/${annee}` : date
}

/**
 * Décrit en une ligne ce qui a été travaillé lors d'une séance.
 *
 * Par ordre de précision : la référence coranique si elle existe, sinon le
 * contenu libre (une séance de tadjwîd n'a pas de sourate), sinon la date —
 * qui ne dit rien du travail, mais identifie au moins la séance dans une liste.
 */
export function libelleContenuSeance(seance: ContenuSeance): string {
  if (estRenseigne(seance.sourate)) {
    const sourate = seance.sourate.trim()

    if (seance.versets_de !== null && seance.versets_a !== null) {
      return `${sourate} v${seance.versets_de}–${seance.versets_a}`
    }
    // Un verset de fin seul ne borne rien : on n'affiche que le début.
    if (seance.versets_de !== null) {
      return `${sourate} v${seance.versets_de}`
    }

    return sourate
  }

  if (estRenseigne(seance.contenu_aborde)) {
    return seance.contenu_aborde.trim()
  }

  return `Séance du ${formaterDate(seance.date)}`
}
