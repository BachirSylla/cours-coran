import { z } from 'zod'

/**
 * Validation du rachat d'un code d'invitation (migration 0016).
 *
 * Le code est **normalisé côté serveur** (majuscules, ponctuation ignorée,
 * O → 0 et I/L → 1) : ce schéma ne fait que refuser une saisie manifestement
 * trop courte, sans tenter de reproduire cette normalisation — la dupliquer
 * ici, c'est se condamner à ce que les deux divergent.
 */
export const rachatSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, { message: 'Le code est obligatoire.' })
    .refine((valeur) => valeur.replace(/[^0-9A-Za-z]/g, '').length === 12, {
      message: 'Un code comporte 12 caractères, par exemple ABCD-EFGH-JKMN.',
    }),
  nomAffiche: z
    .string()
    .trim()
    .min(1, { message: 'Indiquez le nom sous lequel vos collègues vous verront.' })
    .max(80, { message: 'Le nom ne peut pas dépasser 80 caractères.' }),
})

export type RachatFormValues = z.infer<typeof rachatSchema>
