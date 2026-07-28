import { z } from 'zod'

/**
 * Validation du formulaire de connexion.
 * Schéma unique partagé par React Hook Form et la logique (CLAUDE.md §9).
 */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { message: "L'adresse e-mail est obligatoire." })
    .pipe(z.email({ message: 'Adresse e-mail invalide.' })),
  motDePasse: z
    .string()
    .min(1, { message: 'Le mot de passe est obligatoire.' })
    .min(6, { message: 'Le mot de passe doit contenir au moins 6 caractères.' }),
})

export type LoginFormValues = z.infer<typeof loginSchema>
