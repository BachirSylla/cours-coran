/**
 * Règle de capacité d'un cours — **applicative**, pas contrainte en base.
 *
 * > Un cours au format `individuel` accueille **exactement 1** apprenant ;
 * > au format `groupe`, **1..N**.
 *
 * La base ne connaît que l'unicité `(apprenant_id, cours_id)` : rien n'empêche
 * un `insert` direct d'inscrire trois apprenants à un cours individuel. Cette
 * règle est donc tenue ici, et documentée dans le CLAUDE.md §5.7.
 *
 * Module **pur** : aucune dépendance à React, Supabase ou au DOM.
 */

/** Nombre maximal d'inscrits pour un cours individuel. */
export const CAPACITE_INDIVIDUEL = 1

export type RaisonRefus = 'complet' | 'deja_inscrit'

export interface VerdictInscription {
  autorise: boolean
  raison?: RaisonRefus
}

/** Un cours individuel est plein dès qu'il compte un inscrit. */
export function capaciteAtteinte(format: string, nbInscrits: number): boolean {
  return format === 'individuel' && nbInscrits >= CAPACITE_INDIVIDUEL
}

/** Peut-on ajouter un apprenant de plus à ce cours ? */
export function peutAjouterInscription(
  format: string,
  nbInscrits: number,
  dejaInscrit = false
): VerdictInscription {
  if (dejaInscrit) return { autorise: false, raison: 'deja_inscrit' }
  if (capaciteAtteinte(format, nbInscrits)) return { autorise: false, raison: 'complet' }

  return { autorise: true }
}

export function messageRefus(raison: RaisonRefus): string {
  return raison === 'deja_inscrit'
    ? 'Cet apprenant est déjà inscrit à ce cours.'
    : "Un cours individuel ne peut accueillir qu'un seul apprenant. Retirez l'apprenant actuel avant d'en ajouter un autre."
}

/**
 * Un cours ne peut basculer en `individuel` que s'il compte au plus un inscrit :
 * sinon le changement de format créerait précisément l'état que la règle interdit.
 */
export function peutPasserEnIndividuel(nbInscrits: number): boolean {
  return nbInscrits <= CAPACITE_INDIVIDUEL
}

export function messageFormatIncompatible(nbInscrits: number): string {
  const aRetirer = nbInscrits - CAPACITE_INDIVIDUEL

  return `Ce cours compte ${nbInscrits} apprenants : retirez-en ${aRetirer} avant de le passer en individuel.`
}
