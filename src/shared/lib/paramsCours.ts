import {
  estBaseAcademique,
  NOTATION_PAR_DEFAUT,
  TOTAL_NOTE_FINALE,
  type ConfigNotation,
} from '@/shared/lib/rapport'

/**
 * Réglages **effectifs** d'un cours : ce que le centre a défini, surchargé par
 * ce que le cours a défini pour lui-même.
 *
 * `null` signifie « hériter ». C'est ce qui rend la nouveauté indolore : un
 * cours dont toutes les surcharges valent `null` se comporte exactement comme
 * avant qu'elles existent.
 *
 * Module **pur** : ni Supabase, ni React.
 */

/** Surcharges telles qu'elles sortent de la table `cours` (migration 0011). */
export interface SurchargesCours {
  logo: string | null
  assiduite_active: boolean | null
  base_academique: string | null
  bareme_assiduite: number | null
  penalite_absence: number | null
  penalite_retard: number | null
  penaliser_absences_excusees: boolean | null
}

/** Ce que le centre définit — la config complète, plus son logo. */
export interface ParametresGlobaux extends ConfigNotation {
  logo: string | null
}

export interface ParametresCoursEffectifs extends ConfigNotation {
  /** Celui du cours, sinon celui du centre, sinon aucun. */
  logo: string | null
}

/**
 * `?? ` et non `||` : `false` et `0` sont des surcharges légitimes. Désactiver
 * l'assiduité ou mettre une pénalité à zéro doit l'emporter sur le global, pas
 * être confondu avec « non renseigné ».
 */
function heriter<T>(surcharge: T | null | undefined, global: T): T {
  return surcharge ?? global
}

export function parametresEffectifs(
  global: ParametresGlobaux,
  cours: SurchargesCours | null
): ParametresCoursEffectifs {
  const base = heriter(cours?.base_academique, global.base_academique)

  const baremeAssiduite = heriter(cours?.bareme_assiduite, global.bareme_assiduite)

  return {
    logo: heriter(cours?.logo, global.logo),
    assiduite_active: heriter(cours?.assiduite_active, global.assiduite_active),
    // La base vient d'une colonne `text` : on la referme sur le domaine plutôt
    // que de laisser une valeur inattendue fausser un calcul de note.
    base_academique: estBaseAcademique(base) ? base : NOTATION_PAR_DEFAUT.base_academique,
    bareme_assiduite: baremeAssiduite,
    /**
     * **Déduite, jamais lue.** Il n'existe pas de colonne `cours.bareme_academique` :
     * une surcharge partielle la rendrait fausse — global 17/3, un cours qui ne
     * règle que l'assiduité à 5 donnerait 17 + 5 = 22. La somme vaut ainsi
     * toujours 20, comme l'impose la contrainte de la migration 0008.
     */
    bareme_academique: TOTAL_NOTE_FINALE - baremeAssiduite,
    penalite_absence: heriter(cours?.penalite_absence, global.penalite_absence),
    penalite_retard: heriter(cours?.penalite_retard, global.penalite_retard),
    penaliser_absences_excusees: heriter(
      cours?.penaliser_absences_excusees,
      global.penaliser_absences_excusees
    ),
  }
}

/** Une surcharge est-elle posée sur ce cours ? Sert à annoncer l'héritage. */
export function aDesSurcharges(cours: SurchargesCours | null): boolean {
  if (!cours) return false

  return Object.values(cours).some((valeur) => valeur !== null)
}
