import { z } from 'zod'

/**
 * Validation de la saisie d'un règlement — schéma unique partagé par le
 * formulaire et la logique (CLAUDE.md §9).
 *
 * Le montant dû n'y figure pas : il est calculé par
 * `shared/lib/paiements.ts` et figé au moment de l'enregistrement, pas saisi.
 */
const FORMAT_DATE = /^\d{4}-\d{2}-\d{2}$/

export const METHODES_COURANTES = ['Espèces', 'Virement', 'Mobile money', 'Chèque'] as const

export const paiementSchema = z.object({
  montant_recu: z
    .union([z.string(), z.number()])
    .transform((valeur) => {
      if (valeur === '') return Number.NaN
      // Le séparateur décimal français est accepté.
      return typeof valeur === 'number' ? valeur : Number(valeur.trim().replace(',', '.'))
    })
    .refine((valeur) => Number.isFinite(valeur) && valeur >= 0, {
      message: 'Le montant reçu doit être un nombre positif ou nul.',
    }),
  date_paiement: z
    .string()
    .trim()
    .optional()
    .transform((valeur) => (valeur === undefined || valeur === '' ? null : valeur))
    .refine((valeur) => valeur === null || FORMAT_DATE.test(valeur), {
      message: 'La date de paiement est invalide.',
    }),
  methode: z
    .string()
    .trim()
    .max(60, { message: 'La méthode ne peut pas dépasser 60 caractères.' })
    .optional()
    .transform((valeur) => (valeur === undefined || valeur === '' ? null : valeur)),
})

export type PaiementFormValues = z.input<typeof paiementSchema>
export type PaiementValues = z.output<typeof paiementSchema>

/** Date du jour au format `AAAA-MM-JJ`, en heure locale. */
export function aujourdhui(): string {
  const maintenant = new Date()
  const mois = String(maintenant.getMonth() + 1).padStart(2, '0')
  const jour = String(maintenant.getDate()).padStart(2, '0')

  return `${maintenant.getFullYear()}-${mois}-${jour}`
}

/** Formulaire pré-rempli : le montant dû du mois, réglé aujourd'hui. */
export function valeursParDefaut(montantDu: number, dejaRecu = 0): PaiementFormValues {
  return {
    montant_recu: String(dejaRecu > 0 ? dejaRecu : montantDu),
    date_paiement: aujourdhui(),
    methode: '',
  }
}
