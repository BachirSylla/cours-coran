import { z } from 'zod'

import { BASES_ACADEMIQUES, TOTAL_NOTE_FINALE, type ConfigNotation } from '@/shared/lib/rapport'

/**
 * Validation des réglages de notation — schéma unique partagé par le formulaire
 * (React Hook Form) et la logique (CLAUDE.md §9).
 *
 * La règle « les deux parts font 20 » vit **ici et nulle part ailleurs** : le
 * formulaire ne propose que la part d'assiduité, et le schéma en déduit la part
 * académique. L'écran ne peut donc pas se retrouver dans un état invalide en
 * attendant qu'on répare la somme.
 */

/** Une pénalité au-delà du total serait absurde, et la base la refuse. */
const MAX_PENALITE = TOTAL_NOTE_FINALE

function nombre(message: string) {
  return z
    .union([z.string(), z.number()])
    .transform((valeur) => {
      if (typeof valeur === 'number') return valeur
      // Le séparateur décimal français est accepté : « 0,5 ».
      const texte = valeur.trim().replace(',', '.')
      return texte === '' ? Number.NaN : Number(texte)
    })
    .refine((valeur) => Number.isFinite(valeur), { message })
}

export const notationSchema = z
  .object({
    bareme_assiduite: nombre("La part d'assiduité doit être un nombre.").refine(
      (valeur) => Number.isInteger(valeur) && valeur >= 0 && valeur <= TOTAL_NOTE_FINALE,
      { message: `La part d'assiduité doit être un entier entre 0 et ${TOTAL_NOTE_FINALE}.` }
    ),
    penalite_absence: nombre('La pénalité par absence doit être un nombre.').refine(
      (valeur) => valeur >= 0 && valeur <= MAX_PENALITE,
      { message: `La pénalité par absence doit être comprise entre 0 et ${MAX_PENALITE}.` }
    ),
    penalite_retard: nombre('La pénalité par retard doit être un nombre.').refine(
      (valeur) => valeur >= 0 && valeur <= MAX_PENALITE,
      { message: `La pénalité par retard doit être comprise entre 0 et ${MAX_PENALITE}.` }
    ),
    penaliser_absences_excusees: z.boolean(),
    base_academique: z.enum(BASES_ACADEMIQUES, { message: 'Base de notation inconnue.' }),
    assiduite_active: z.boolean(),
  })
  // La part académique n'est jamais saisie : elle est ce qui reste.
  .transform((valeurs): ConfigNotation => ({
    ...valeurs,
    bareme_academique: TOTAL_NOTE_FINALE - valeurs.bareme_assiduite,
  }))

export type NotationFormValues = z.input<typeof notationSchema>
export type NotationValues = z.output<typeof notationSchema>

/** Remplit le formulaire à partir des réglages en vigueur. */
export function valeursParDefaut(config: ConfigNotation): NotationFormValues {
  return {
    bareme_assiduite: String(config.bareme_assiduite),
    penalite_absence: String(config.penalite_absence).replace('.', ','),
    penalite_retard: String(config.penalite_retard).replace('.', ','),
    penaliser_absences_excusees: config.penaliser_absences_excusees,
    base_academique: config.base_academique,
    assiduite_active: config.assiduite_active,
  }
}
