import { describe, expect, it } from 'vitest'

import {
  apprenantSchema,
  aujourdhui,
  LIBELLES_STATUT,
  STATUTS_APPRENANT,
  valeursParDefaut,
} from '@/features/apprenants/apprenantSchema'

const minimal = { nom: 'Sylla', prenom: 'Bachir' }

function messagePour(donnees: unknown, champ: string): string | undefined {
  const resultat = apprenantSchema.safeParse(donnees)
  if (resultat.success) return undefined
  return resultat.error.issues.find((issue) => issue.path[0] === champ)?.message
}

describe('apprenantSchema', () => {
  it('accepte le strict minimum : nom et prénom', () => {
    const resultat = apprenantSchema.safeParse(minimal)

    expect(resultat.success).toBe(true)
  })

  it('applique les valeurs par défaut (statut actif, date du jour)', () => {
    const resultat = apprenantSchema.parse(minimal)

    expect(resultat.statut).toBe('actif')
    expect(resultat.date_inscription).toBe(aujourdhui())
  })

  it('transforme les champs facultatifs vides en null pour la base', () => {
    const resultat = apprenantSchema.parse({
      ...minimal,
      contact: '',
      niveau: '   ',
      notes: '',
    })

    expect(resultat.contact).toBeNull()
    expect(resultat.niveau).toBeNull()
    expect(resultat.notes).toBeNull()
  })

  it('conserve et nettoie les champs facultatifs renseignés', () => {
    const resultat = apprenantSchema.parse({
      ...minimal,
      contact: '  +224 600 00 00 00  ',
      niveau: 'Qaïda',
    })

    expect(resultat.contact).toBe('+224 600 00 00 00')
    expect(resultat.niveau).toBe('Qaïda')
  })

  it('nettoie les espaces autour du nom et du prénom', () => {
    const resultat = apprenantSchema.parse({ nom: '  Sylla  ', prenom: '  Bachir  ' })

    expect(resultat.nom).toBe('Sylla')
    expect(resultat.prenom).toBe('Bachir')
  })

  it('refuse un nom ou un prénom vide', () => {
    expect(messagePour({ ...minimal, nom: '' }, 'nom')).toBe('Le nom est obligatoire.')
    expect(messagePour({ ...minimal, prenom: '   ' }, 'prenom')).toBe(
      'Le prénom est obligatoire.'
    )
  })

  it('refuse un nom trop long', () => {
    expect(messagePour({ ...minimal, nom: 'a'.repeat(81) }, 'nom')).toBe(
      'Le nom ne peut pas dépasser 80 caractères.'
    )
  })

  it('refuse un contact trop long', () => {
    expect(messagePour({ ...minimal, contact: 'a'.repeat(121) }, 'contact')).toBe(
      'Le contact ne peut pas dépasser 120 caractères.'
    )
  })

  it('accepte les trois statuts prévus et refuse les autres', () => {
    for (const statut of STATUTS_APPRENANT) {
      expect(apprenantSchema.safeParse({ ...minimal, statut }).success).toBe(true)
    }

    expect(messagePour({ ...minimal, statut: 'inconnu' }, 'statut')).toBe('Statut inconnu.')
  })

  it('refuse une date d’inscription mal formée', () => {
    expect(
      messagePour({ ...minimal, date_inscription: '01/02/2026' }, 'date_inscription')
    ).toBe("La date d'inscription est invalide.")
  })

  it('accepte une date au format AAAA-MM-JJ', () => {
    const resultat = apprenantSchema.parse({ ...minimal, date_inscription: '2026-02-01' })

    expect(resultat.date_inscription).toBe('2026-02-01')
  })

  it('produit des valeurs par défaut de formulaire valides', () => {
    const defauts = valeursParDefaut()

    expect(defauts.statut).toBe('actif')
    expect(defauts.date_inscription).toBe(aujourdhui())
    // Le nom et le prénom sont vides : le formulaire s'ouvre vierge, donc invalide.
    expect(apprenantSchema.safeParse(defauts).success).toBe(false)
    expect(apprenantSchema.safeParse({ ...defauts, nom: 'A', prenom: 'B' }).success).toBe(true)
  })

  it('a un libellé français pour chaque statut', () => {
    for (const statut of STATUTS_APPRENANT) {
      expect(LIBELLES_STATUT[statut]).toBeTruthy()
    }
  })
})

describe('aujourdhui', () => {
  it('renvoie une date locale au format AAAA-MM-JJ', () => {
    expect(aujourdhui()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
