/**
 * Détection des conflits d'horaires — cœur métier (CLAUDE.md §5.1).
 *
 * La ressource rare est **l'enseignant**, pas le centre : nul ne peut être à
 * deux endroits à la fois, mais deux enseignants différents tiennent très bien
 * cours à la même heure. Le conflit se scope donc sur `enseignant_id`, et deux
 * créneaux qui se chevauchent sans partager d'enseignant ne se gênent pas.
 *
 * Le chevauchement **temporel** (`creneauxSeChevauchent`) reste séparé de la
 * règle métier (`creneauxEnConflit`) : le premier ne connaît que des heures, ce
 * qui le garde trivialement testable, et le second ajoute l'enseignant.
 *
 * Module **pur** : aucune dépendance à Supabase, React, ni au DOM. Il ne
 * manipule que des objets satisfaisant `CreneauHoraire`, ce qui le rend
 * testable unitairement et réutilisable côté formulaire comme côté grille.
 */

/** Jour ISO-8601 : 1 = lundi … 7 = dimanche (aligné sur `getISODay` de date-fns). */
export type JourSemaine = 1 | 2 | 3 | 4 | 5 | 6 | 7

/**
 * Contrat minimal d'un créneau. Les fonctions du module sont génériques
 * (`<T extends CreneauHoraire>`) afin de préserver les propriétés réelles
 * (`id`, `cours_id`, `libelle`…) dans les valeurs retournées.
 */
export interface CreneauHoraire {
  jour_semaine: JourSemaine
  /** Format `HH:MM` ou `HH:MM:SS` (type `time` de Postgres). */
  heure_debut: string
  /** Format `HH:MM` ou `HH:MM:SS` (type `time` de Postgres). */
  heure_fin: string
}

/**
 * Créneau rattaché à l'enseignant qui l'assure — c'est-à-dire à celui qui est
 * **affecté au cours** (`cours.enseignant_id`), et non à l'utilisateur connecté :
 * un responsable qui pose le planning d'un enseignant doit voir ses créneaux
 * contrôlés contre l'agenda de cet enseignant-là, pas contre le sien.
 *
 * `null` = cours sans enseignant affecté. Ces créneaux forment alors **un groupe
 * à part**, qui se contrôle contre lui-même : on ne suppose pas qu'un cours
 * orphelin ne gêne personne, on suppose qu'il gêne les autres orphelins.
 */
export interface CreneauAffecte extends CreneauHoraire {
  enseignant_id: string | null
}

/** Options communes à `trouverConflits` et `aDesConflits`. */
export interface OptionsConflit<T> {
  /**
   * Prédicat d'exclusion : tout créneau pour lequel il renvoie `true` est ignoré.
   * Utile lorsqu'on revalide un créneau déjà enregistré (il ne doit pas
   * entrer en conflit avec lui-même).
   */
  ignorer?: (creneau: T) => boolean
  /** Raccourci : ignore le créneau dont la clé identifiante vaut cette valeur. */
  ignorerId?: string | number
  /** Nom de la propriété identifiante utilisée par `ignorerId` (défaut : `id`). */
  cleId?: string
}

const FORMAT_HEURE = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/

/**
 * Convertit une heure `HH:MM` ou `HH:MM:SS` en minutes depuis minuit.
 * Les secondes sont ignorées : la granularité métier est la minute.
 *
 * @throws {Error} si la chaîne n'est pas une heure valide (0 h à 24 h).
 */
export function heureEnMinutes(heure: string): number {
  const correspondance = FORMAT_HEURE.exec(heure.trim())

  if (!correspondance) {
    throw new Error(`Heure invalide : « ${heure} » (format attendu HH:MM ou HH:MM:SS)`)
  }

  const heures = Number(correspondance[1])
  const minutes = Number(correspondance[2])

  if (heures > 24 || (heures === 24 && minutes > 0)) {
    throw new Error(`Heure invalide : « ${heure} » (au-delà de 24:00)`)
  }

  return heures * 60 + minutes
}

/**
 * Règle de conflit (CLAUDE.md §5.1) :
 * `même jour_semaine ET debut_A < fin_B ET debut_B < fin_A`.
 *
 * Inégalités **strictes**, aucune marge : deux créneaux adjacents
 * (11:00–12:00 et 12:00–13:00) ne sont pas en conflit.
 * Les créneaux ne franchissent jamais minuit.
 */
export function creneauxSeChevauchent(a: CreneauHoraire, b: CreneauHoraire): boolean {
  if (a.jour_semaine !== b.jour_semaine) return false

  const debutA = heureEnMinutes(a.heure_debut)
  const finA = heureEnMinutes(a.heure_fin)
  const debutB = heureEnMinutes(b.heure_debut)
  const finB = heureEnMinutes(b.heure_fin)

  return debutA < finB && debutB < finA
}

/**
 * Deux créneaux relèvent-ils du même agenda ?
 *
 * `null === null` est vrai en JavaScript, ce qui range les cours sans enseignant
 * dans un même groupe — exactement ce que fait `is not distinct from` côté SQL.
 */
export function memeEnseignant(a: CreneauAffecte, b: CreneauAffecte): boolean {
  return a.enseignant_id === b.enseignant_id
}

/**
 * La règle métier complète : **même enseignant ET chevauchement horaire**.
 *
 * C'est elle, et non `creneauxSeChevauchent`, que doit appeler tout ce qui
 * signale un conflit à l'utilisateur.
 */
export function creneauxEnConflit(a: CreneauAffecte, b: CreneauAffecte): boolean {
  return memeEnseignant(a, b) && creneauxSeChevauchent(a, b)
}

function estIgnore<T extends CreneauHoraire>(creneau: T, options?: OptionsConflit<T>): boolean {
  if (!options) return false

  if (options.ignorer?.(creneau)) return true

  if (options.ignorerId !== undefined) {
    const cle = options.cleId ?? 'id'
    return (creneau as Record<string, unknown>)[cle] === options.ignorerId
  }

  return false
}

/**
 * Renvoie tous les créneaux d'`existants` en conflit avec `cible`.
 *
 * Lors de la **modification** d'un créneau déjà enregistré, l'exclure via
 * `{ ignorerId: creneau.id }` (ou `{ ignorer: (c) => c.id === creneau.id }`)
 * pour qu'il n'entre pas en conflit avec lui-même.
 */
export function trouverConflits<T extends CreneauAffecte>(
  cible: CreneauAffecte,
  existants: readonly T[],
  options?: OptionsConflit<T>
): T[] {
  return existants.filter(
    (existant) => !estIgnore(existant, options) && creneauxEnConflit(cible, existant)
  )
}

/** Variante booléenne de `trouverConflits`, sans construire la liste complète. */
export function aDesConflits<T extends CreneauAffecte>(
  cible: CreneauAffecte,
  existants: readonly T[],
  options?: OptionsConflit<T>
): boolean {
  return existants.some(
    (existant) => !estIgnore(existant, options) && creneauxEnConflit(cible, existant)
  )
}

/**
 * Toutes les paires en conflit à l'intérieur d'un ensemble de créneaux —
 * pour valider ou colorer la grille hebdomadaire d'un coup.
 *
 * Les créneaux sont **regroupés par enseignant** avant d'être comparés : deux
 * agendas différents ne se croisent jamais, ce qui supprime le faux conflit
 * autant que la comparaison inutile.
 *
 * Chaque paire n'apparaît qu'une fois : `(A, B)` est renvoyée, jamais `(B, A)`,
 * et l'ordre d'entrée est préservé **à l'intérieur** de chaque agenda.
 */
export function detecterTousLesConflits<T extends CreneauAffecte>(
  creneaux: readonly T[]
): [T, T][] {
  const parEnseignant = new Map<string | null, T[]>()

  for (const creneau of creneaux) {
    const agenda = parEnseignant.get(creneau.enseignant_id)
    if (agenda) agenda.push(creneau)
    else parEnseignant.set(creneau.enseignant_id, [creneau])
  }

  const paires: [T, T][] = []

  for (const agenda of parEnseignant.values()) {
    for (let i = 0; i < agenda.length; i++) {
      for (let j = i + 1; j < agenda.length; j++) {
        const a = agenda[i]
        const b = agenda[j]
        if (a && b && creneauxSeChevauchent(a, b)) {
          paires.push([a, b])
        }
      }
    }
  }

  return paires
}
