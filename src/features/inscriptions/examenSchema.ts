import { z } from 'zod'

import { estNoteValide } from '@/shared/lib/evaluations'

/**
 * Validation de la note d'examen de fin de session.
 *
 * Même primitive que les notes de récitation (`estNoteValide`), et pour la même
 * raison : la règle de bornes n'existe qu'à un seul endroit,
 * `shared/lib/evaluations.ts`. Comme le maximum dépend du barème choisi au
 * moment de la saisie, c'est une **fabrique** et non un schéma figé.
 */
export function creerExamenSchema(bareme: number) {
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
  })
}

export type SchemaExamen = ReturnType<typeof creerExamenSchema>
export type ExamenFormValues = z.input<SchemaExamen>
export type ExamenValues = z.output<SchemaExamen>

/** Valeur initiale du champ : la note déjà enregistrée, ou rien. */
export function valeurParDefaut(note: number | null): ExamenFormValues {
  return { note: note === null ? '' : String(note) }
}
