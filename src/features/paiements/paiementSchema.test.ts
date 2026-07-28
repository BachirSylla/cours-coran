import { describe, expect, it } from 'vitest'

import {
  aujourdhui,
  METHODES_COURANTES,
  paiementSchema,
  valeursParDefaut,
} from '@/features/paiements/paiementSchema'

function messagePour(donnees: unknown, chemin: string): string | undefined {
  const resultat = paiementSchema.safeParse(donnees)
  if (resultat.success) return undefined
  return resultat.error.issues.find((issue) => issue.path.join('.') === chemin)?.message
}

describe('paiementSchema', () => {
  it('accepte un montant seul', () => {
    const resultat = paiementSchema.parse({ montant_recu: '15000' })

    expect(resultat.montant_recu).toBe(15000)
    expect(resultat.date_paiement).toBeNull()
    expect(resultat.methode).toBeNull()
  })

  it('accepte un montant nul (règlement remis à zéro)', () => {
    expect(paiementSchema.parse({ montant_recu: '0' }).montant_recu).toBe(0)
  })

  it('accepte la virgule comme séparateur décimal', () => {
    expect(paiementSchema.parse({ montant_recu: '1500,50' }).montant_recu).toBe(1500.5)
  })

  it('accepte un nombre déjà typé', () => {
    expect(paiementSchema.parse({ montant_recu: 2500 }).montant_recu).toBe(2500)
  })

  it('refuse un montant négatif', () => {
    expect(messagePour({ montant_recu: '-1' }, 'montant_recu')).toBe(
      'Le montant reçu doit être un nombre positif ou nul.'
    )
  })

  it('refuse un montant vide ou non numérique', () => {
    expect(messagePour({ montant_recu: '' }, 'montant_recu')).toMatch(/nombre positif/)
    expect(messagePour({ montant_recu: 'gratuit' }, 'montant_recu')).toMatch(/nombre positif/)
  })

  it('transforme une date vide en null', () => {
    expect(
      paiementSchema.parse({ montant_recu: '1', date_paiement: '' }).date_paiement
    ).toBeNull()
  })

  it('accepte une date au format AAAA-MM-JJ', () => {
    expect(
      paiementSchema.parse({ montant_recu: '1', date_paiement: '2026-07-25' }).date_paiement
    ).toBe('2026-07-25')
  })

  it('refuse une date mal formée', () => {
    expect(
      messagePour({ montant_recu: '1', date_paiement: '25/07/2026' }, 'date_paiement')
    ).toBe('La date de paiement est invalide.')
  })

  it('transforme une méthode vide en null et nettoie les espaces', () => {
    expect(paiementSchema.parse({ montant_recu: '1', methode: '  ' }).methode).toBeNull()
    expect(paiementSchema.parse({ montant_recu: '1', methode: '  Espèces ' }).methode).toBe(
      'Espèces'
    )
  })

  it('refuse une méthode trop longue', () => {
    expect(messagePour({ montant_recu: '1', methode: 'a'.repeat(61) }, 'methode')).toMatch(
      /60 caractères/
    )
  })
})

describe('valeursParDefaut', () => {
  it('pré-remplit avec le montant dû quand rien n’a été reçu', () => {
    const defauts = valeursParDefaut(15000)

    expect(defauts.montant_recu).toBe('15000')
    expect(defauts.date_paiement).toBe(aujourdhui())
    expect(paiementSchema.safeParse(defauts).success).toBe(true)
  })

  it('reprend le montant déjà reçu pour une correction', () => {
    expect(valeursParDefaut(15000, 5000).montant_recu).toBe('5000')
  })

  it('propose des méthodes courantes', () => {
    expect(METHODES_COURANTES.length).toBeGreaterThan(0)
  })
})

describe('aujourdhui', () => {
  it('renvoie une date locale au format AAAA-MM-JJ', () => {
    expect(aujourdhui()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
