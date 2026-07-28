import { z } from 'zod'

/**
 * Validation d'un apprenant — schéma unique partagé par le formulaire
 * (React Hook Form) et la logique (CLAUDE.md §9).
 *
 * Deux types en sortent :
 * - `ApprenantFormValues` (`z.input`)  : ce que manipule le formulaire, où les
 *   champs facultatifs sont des chaînes vides ;
 * - `ApprenantValues` (`z.output`)     : ce qui part vers le repository, où ces
 *   mêmes champs valent `null` (colonnes nullables en base).
 */
export const STATUTS_APPRENANT = ['actif', 'pause', 'parti'] as const

export type StatutApprenant = (typeof STATUTS_APPRENANT)[number]

export const LIBELLES_STATUT: Record<StatutApprenant, string> = {
  actif: 'Actif',
  pause: 'En pause',
  parti: 'Parti',
}

/** Date du jour au format `AAAA-MM-JJ`, dans le fuseau local. */
export function aujourdhui(): string {
  const maintenant = new Date()
  const mois = String(maintenant.getMonth() + 1).padStart(2, '0')
  const jour = String(maintenant.getDate()).padStart(2, '0')
  return `${maintenant.getFullYear()}-${mois}-${jour}`
}

/**
 * Champ texte facultatif : absent ou vide côté formulaire → `null` en base
 * (les colonnes correspondantes sont nullables).
 */
function texteFacultatif(maximum: number, messageMax: string) {
  return z
    .string()
    .trim()
    .max(maximum, { message: messageMax })
    .optional()
    .transform((valeur) => (valeur === undefined || valeur === '' ? null : valeur))
}

export const apprenantSchema = z.object({
  nom: z
    .string()
    .trim()
    .min(1, { message: 'Le nom est obligatoire.' })
    .max(80, { message: 'Le nom ne peut pas dépasser 80 caractères.' }),
  prenom: z
    .string()
    .trim()
    .min(1, { message: 'Le prénom est obligatoire.' })
    .max(80, { message: 'Le prénom ne peut pas dépasser 80 caractères.' }),
  contact: texteFacultatif(120, 'Le contact ne peut pas dépasser 120 caractères.'),
  niveau: texteFacultatif(80, 'Le niveau ne peut pas dépasser 80 caractères.'),
  notes: texteFacultatif(2000, 'Les notes ne peuvent pas dépasser 2000 caractères.'),
  statut: z.enum(STATUTS_APPRENANT, { message: 'Statut inconnu.' }).default('actif'),
  date_inscription: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "La date d'inscription est invalide." })
    .default(aujourdhui),
})

export type ApprenantFormValues = z.input<typeof apprenantSchema>
export type ApprenantValues = z.output<typeof apprenantSchema>

/** Valeurs par défaut du formulaire de création. */
export function valeursParDefaut(): ApprenantFormValues {
  return {
    nom: '',
    prenom: '',
    contact: '',
    niveau: '',
    notes: '',
    statut: 'actif',
    date_inscription: aujourdhui(),
  }
}
