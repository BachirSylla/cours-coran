import type { EtatPresence } from '@/shared/lib/rapport'
import type { NiveauNote } from '@/shared/lib/rapportSession'

/**
 * Mise en forme de la feuille imprimée — module pur, sans React.
 *
 * Les classes Tailwind sont écrites **en entier** : l'analyseur de Tailwind v4
 * lit le source comme du texte, `bg-${couleur}-100` ne produirait aucune règle.
 */

/**
 * Une teinte claire, une bordure et une lettre foncées — jamais un aplat saturé
 * avec du texte blanc. Si l'imprimante supprime les fonds, la bordure et la
 * lettre restent ; en niveaux de gris, la lettre porte encore l'information.
 */
export const FOND_ETAT: Record<EtatPresence, string> = {
  present: 'bg-emerald-500 text-emerald-950',
  retard: 'bg-amber-300 text-amber-950',
  absent: 'bg-rose-200 text-rose-900',
  excuse: 'bg-sky-200 text-sky-900',
  partiel: 'bg-teal-200 text-teal-900',
}

/** Le glyphe inscrit dans la case — l'information de secours en noir et blanc. */
export const LETTRE_ETAT: Record<EtatPresence, string> = {
  present: 'P',
  retard: 'R',
  absent: 'A',
  excuse: 'E',
  partiel: '½',
}

/** Mise en valeur de la note finale, selon son niveau. */
export const FOND_NOTE: Record<NiveauNote, string> = {
  bon: 'bg-emerald-100 text-emerald-900',
  moyen: 'bg-amber-100 text-amber-900',
  faible: 'bg-rose-100 text-rose-900',
}

/**
 * `16.34` → « 16,34 », `15` → « 15 ». Virgule décimale française et pas de
 * zéro superflu : c'est un document français, et l'application formate ainsi
 * partout ailleurs.
 */
export function nombreFr(valeur: number | null, decimales = 2): string {
  if (valeur === null || !Number.isFinite(valeur)) return '—'

  const arrondi = Math.round(valeur * 10 ** decimales) / 10 ** decimales

  return String(arrondi).replace('.', ',')
}

/** `2026-03-15` → « 15/03 » — l'en-tête de colonne de la grille de présence. */
export function jourMois(date: string): string {
  const [, mois, jour] = date.split('-')

  return mois && jour ? `${jour}/${mois}` : date
}

/** `2026-03-15` → « 15/03/2026 ». */
export function dateFr(date: string): string {
  const [annee, mois, jour] = date.split('-')

  return annee && mois && jour ? `${jour}/${mois}/${annee}` : date
}
