import { z } from 'zod'

/**
 * Validation de la saisie d'une séance — schéma unique partagé par le
 * formulaire et la logique (CLAUDE.md §9).
 *
 * Tous les champs pédagogiques sont facultatifs : une séance peut n'être qu'un
 * statut (« annulée »), et l'initiation ne renseigne souvent que le texte libre.
 */
export const STATUTS_SEANCE = ['faite', 'annulee', 'reportee', 'absence'] as const
export const TYPES_TRAVAIL = ['nouvelle_memorisation', 'revision', 'lecture'] as const

export type StatutSeance = (typeof STATUTS_SEANCE)[number]
export type TypeTravail = (typeof TYPES_TRAVAIL)[number]

export const LIBELLES_STATUT_SEANCE: Record<StatutSeance, string> = {
  faite: 'Faite',
  annulee: 'Annulée',
  reportee: 'Reportée',
  absence: 'Absence',
}

export const LIBELLES_TYPE_TRAVAIL: Record<TypeTravail, string> = {
  nouvelle_memorisation: 'Nouvelle mémorisation',
  revision: 'Révision (murâja’a)',
  lecture: 'Lecture',
}

/** Champ texte facultatif : absent ou vide → `null` (colonne nullable). */
function texteFacultatif(maximum: number, messageMax: string) {
  return z
    .string()
    .trim()
    .max(maximum, { message: messageMax })
    .optional()
    .transform((valeur) => (valeur === undefined || valeur === '' ? null : valeur))
}

/** Numéro de verset facultatif : chaîne vide → `null`, sinon entier ≥ 1. */
const versetFacultatif = z
  .union([z.string(), z.number()])
  .optional()
  .transform((valeur) => {
    if (valeur === undefined || valeur === '') return null
    return typeof valeur === 'number' ? valeur : Number(valeur.trim())
  })
  .refine((valeur) => valeur === null || (Number.isInteger(valeur) && valeur >= 1), {
    message: 'Le numéro de verset doit être un entier supérieur ou égal à 1.',
  })

export const seanceSchema = z
  .object({
    statut: z.enum(STATUTS_SEANCE, { message: 'Statut invalide.' }).default('faite'),
    contenu_aborde: texteFacultatif(
      2000,
      'Le contenu abordé ne peut pas dépasser 2000 caractères.'
    ),
    sourate: texteFacultatif(80, 'Le nom de la sourate ne peut pas dépasser 80 caractères.'),
    versets_de: versetFacultatif,
    versets_a: versetFacultatif,
    type_travail: z
      .union([z.enum(TYPES_TRAVAIL), z.literal('')])
      .optional()
      .transform((valeur) => (valeur === undefined || valeur === '' ? null : valeur)),
    exercices_a_faire: texteFacultatif(
      2000,
      'Les exercices ne peuvent pas dépasser 2000 caractères.'
    ),
    observations: texteFacultatif(
      2000,
      'Les observations ne peuvent pas dépasser 2000 caractères.'
    ),
  })
  .superRefine((seance, ctx) => {
    // Ce refinement s'exécute même si un champ a déjà échoué : on ne compare que
    // deux valeurs déjà valides, sinon on laisse l'erreur du champ parler.
    if (typeof seance.versets_de !== 'number' || typeof seance.versets_a !== 'number') return

    if (seance.versets_a < seance.versets_de) {
      ctx.addIssue({
        code: 'custom',
        path: ['versets_a'],
        message: 'Le verset de fin doit être supérieur ou égal au verset de début.',
      })
    }
  })

export type SeanceFormValues = z.input<typeof seanceSchema>
export type SeanceValues = z.output<typeof seanceSchema>

export function valeursParDefaut(): SeanceFormValues {
  return {
    statut: 'faite',
    contenu_aborde: '',
    sourate: '',
    versets_de: '',
    versets_a: '',
    type_travail: '',
    exercices_a_faire: '',
    observations: '',
  }
}

/**
 * Le bloc « Détails Coran » est déplié pour la lecture et la mémorisation,
 * replié pour l'initiation. Simple défaut d'affichage : tous les champs restent
 * accessibles, une heuristique fausse est sans conséquence.
 */
export function typeCoursCoranique(libelleType: string | null | undefined): boolean {
  if (!libelleType) return false

  // « Initiation à la lecture du Coran » contient « lecture » : l'exclure
  // d'abord, sinon le libellé de référence le plus courant serait mal classé.
  if (/initiation/i.test(libelleType)) return false

  return /lecture|m[ée]morisation/i.test(libelleType)
}
