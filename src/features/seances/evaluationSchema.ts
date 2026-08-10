import { z } from 'zod'

import { estNoteValide } from '@/shared/lib/evaluations'

/**
 * Validation de l'évaluation d'une récitation.
 *
 * Le maximum dépend du barème effectif, connu seulement à l'exécution : d'où
 * une **fabrique** plutôt qu'un schéma figé. La règle de bornes elle-même vit
 * dans `shared/lib/evaluations.ts` — le schéma ne fait que l'appeler, il n'en
 * possède pas une seconde version.
 */
function texteFacultatif(maximum: number, messageMax: string) {
  return z
    .string()
    .trim()
    .max(maximum, { message: messageMax })
    .optional()
    .transform((valeur) => (valeur === undefined || valeur === '' ? null : valeur))
}

export function creerEvaluationSchema(bareme: number) {
  return z.object({
    note: z
      .union([z.string(), z.number()])
      .optional()
      .transform((valeur) => {
        if (valeur === undefined || valeur === '') return null
        // La virgule décimale française est acceptée : « 14,5 ».
        return typeof valeur === 'number' ? valeur : Number(valeur.trim().replace(',', '.'))
      })
      .refine((valeur) => valeur === null || estNoteValide(valeur, bareme), {
        message: `La note doit être comprise entre 0 et ${bareme}.`,
      }),
    commentaire: texteFacultatif(500, 'Le commentaire ne peut pas dépasser 500 caractères.'),
    passage_evalue: texteFacultatif(
      200,
      'Le passage évalué ne peut pas dépasser 200 caractères.'
    ),
  })
}

export type SchemaEvaluation = ReturnType<typeof creerEvaluationSchema>
export type EvaluationFormValues = z.input<SchemaEvaluation>
export type EvaluationValues = z.output<SchemaEvaluation>

/** Valeurs initiales d'une ligne : la note déjà saisie, ou le passage suggéré. */
export function valeursParDefaut(
  existant: {
    note: number | null
    commentaire: string | null
    passage_evalue: string | null
  } | null,
  passageSuggere: string | null
): EvaluationFormValues {
  return {
    note: existant?.note === null || existant?.note === undefined ? '' : String(existant.note),
    commentaire: existant?.commentaire ?? '',
    passage_evalue: existant?.passage_evalue ?? passageSuggere ?? '',
  }
}
