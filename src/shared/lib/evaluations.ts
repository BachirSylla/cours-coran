/**
 * Évaluation de la récitation : notes, barèmes et tendance.
 *
 * Une note ne veut rien dire sans son barème — c'est pourquoi il l'accompagne
 * partout, y compris en base. Toute comparaison passe par le **pourcentage** :
 * un 8/10 et un 16/20 valent la même chose, ce qu'une comparaison des notes
 * brutes manquerait complètement.
 *
 * Module **pur** : ni Supabase, ni React, ni DOM.
 */

export const BAREMES = [10, 20] as const

export type Bareme = (typeof BAREMES)[number]

export type Tendance = 'progression' | 'stable' | 'baisse' | 'insuffisant'

export const LIBELLES_TENDANCE: Record<Tendance, string> = {
  progression: 'En progression',
  stable: 'Stable',
  baisse: 'En baisse',
  insuffisant: 'Pas assez de notes',
}

/** Une note datée, avec le barème sous lequel elle a été donnée. */
export interface Evaluation {
  /** Format `AAAA-MM-JJ`. */
  date: string
  note: number
  note_bareme: number
}

/** Nombre minimal d'évaluations avant d'oser parler de tendance. */
export const MINIMUM_POUR_TENDANCE = 4

/**
 * Écart, en points de pourcentage, à partir duquel on considère qu'il se passe
 * quelque chose. 5 points sur 100, c'est 1 point sur 20 : un écart réel, pas du
 * bruit de mesure.
 */
export const SEUIL_TENDANCE = 5

export function estBaremeConnu(bareme: number): bareme is Bareme {
  return (BAREMES as readonly number[]).includes(bareme)
}

/** Une note est valide si elle est un nombre fini entre 0 et son barème. */
export function estNoteValide(note: number, bareme: number): boolean {
  if (!Number.isFinite(note) || !Number.isFinite(bareme) || bareme <= 0) return false

  return note >= 0 && note <= bareme
}

/**
 * Ramène une note sur 100 — le seul terrain où des barèmes différents se
 * comparent. Un barème absurde renvoie 0 plutôt que `Infinity` ou `NaN`.
 */
export function noteEnPourcentage(note: number, bareme: number): number {
  if (!Number.isFinite(note) || !Number.isFinite(bareme) || bareme <= 0) return 0

  return (note / bareme) * 100
}

/** Moyenne en pourcentage, ou `null` si la liste est vide. */
export function moyennePourcentage(evaluations: readonly Evaluation[]): number | null {
  if (evaluations.length === 0) return null

  const somme = evaluations.reduce(
    (total, evaluation) => total + noteEnPourcentage(evaluation.note, evaluation.note_bareme),
    0
  )

  return somme / evaluations.length
}

/**
 * Tendance d'un apprenant : on trie par date, on coupe en deux moitiés et on
 * compare leurs moyennes **en pourcentage**.
 *
 * En dessous de {@link MINIMUM_POUR_TENDANCE} notes, on renvoie `insuffisant`
 * plutôt qu'une conclusion tirée de deux séances — un apprenant enrhumé un jour
 * n'est pas « en régression ».
 *
 * Sur un nombre impair d'évaluations, celle du milieu revient à la moitié
 * ancienne : le passé sert de référence, on ne le laisse pas déborder sur le
 * présent qu'on veut juger.
 */
export function tendance(evaluations: readonly Evaluation[]): Tendance {
  if (evaluations.length < MINIMUM_POUR_TENDANCE) return 'insuffisant'

  const triees = [...evaluations].sort((a, b) => a.date.localeCompare(b.date))
  const coupure = Math.ceil(triees.length / 2)

  const moyenneAnciennes = moyennePourcentage(triees.slice(0, coupure))
  const moyenneRecentes = moyennePourcentage(triees.slice(coupure))

  if (moyenneAnciennes === null || moyenneRecentes === null) return 'insuffisant'

  const ecart = moyenneRecentes - moyenneAnciennes

  if (ecart >= SEUIL_TENDANCE) return 'progression'
  if (ecart <= -SEUIL_TENDANCE) return 'baisse'

  return 'stable'
}

/** « 15,5/20 » — virgule décimale française, sans décimale superflue. */
export function formaterNote(note: number, bareme: number): string {
  const arrondie = Math.round(note * 100) / 100

  return `${String(arrondie).replace('.', ',')}/${bareme}`
}
