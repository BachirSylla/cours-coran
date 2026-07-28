import { describe, expect, it } from 'vitest'

import { loginSchema } from '@/features/auth/loginSchema'

/** Premier message d'erreur associé à un champ, ou `undefined` si valide. */
function messagePour(donnees: unknown, champ: 'email' | 'motDePasse'): string | undefined {
  const resultat = loginSchema.safeParse(donnees)
  if (resultat.success) return undefined
  return resultat.error.issues.find((issue) => issue.path[0] === champ)?.message
}

describe('loginSchema', () => {
  const valide = { email: 'enseignant@exemple.com', motDePasse: 'motdepasse' }

  it('accepte des identifiants valides', () => {
    const resultat = loginSchema.safeParse(valide)

    expect(resultat.success).toBe(true)
    expect(resultat.data).toEqual(valide)
  })

  it('nettoie les espaces autour de l’e-mail', () => {
    const resultat = loginSchema.safeParse({ ...valide, email: '  enseignant@exemple.com  ' })

    expect(resultat.success).toBe(true)
    expect(resultat.data?.email).toBe('enseignant@exemple.com')
  })

  it('refuse un e-mail vide', () => {
    expect(messagePour({ ...valide, email: '' }, 'email')).toBe(
      "L'adresse e-mail est obligatoire."
    )
  })

  it('refuse un e-mail composé uniquement d’espaces', () => {
    expect(messagePour({ ...valide, email: '   ' }, 'email')).toBe(
      "L'adresse e-mail est obligatoire."
    )
  })

  it('refuse un e-mail mal formé', () => {
    expect(messagePour({ ...valide, email: 'enseignant' }, 'email')).toBe(
      'Adresse e-mail invalide.'
    )
    expect(messagePour({ ...valide, email: 'enseignant@' }, 'email')).toBe(
      'Adresse e-mail invalide.'
    )
  })

  it('refuse un mot de passe vide', () => {
    expect(messagePour({ ...valide, motDePasse: '' }, 'motDePasse')).toBe(
      'Le mot de passe est obligatoire.'
    )
  })

  it('refuse un mot de passe trop court', () => {
    expect(messagePour({ ...valide, motDePasse: '12345' }, 'motDePasse')).toBe(
      'Le mot de passe doit contenir au moins 6 caractères.'
    )
  })

  it('accepte un mot de passe de 6 caractères exactement', () => {
    expect(loginSchema.safeParse({ ...valide, motDePasse: '123456' }).success).toBe(true)
  })

  it('refuse des champs absents ou d’un mauvais type', () => {
    expect(loginSchema.safeParse({}).success).toBe(false)
    expect(loginSchema.safeParse({ email: 42, motDePasse: null }).success).toBe(false)
  })

  it('rend tous les messages en français', () => {
    const resultat = loginSchema.safeParse({ email: 'nope', motDePasse: '1' })

    expect(resultat.success).toBe(false)
    for (const issue of resultat.error?.issues ?? []) {
      expect(issue.message).toMatch(/[À-ÿ' ]/)
      expect(issue.message).not.toMatch(/[Ii]nvalid |[Ss]tring must|[Rr]equired/)
    }
  })
})
