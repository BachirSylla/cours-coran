import { describe, expect, it } from 'vitest'

import { creerExamenSchema, valeurParDefaut } from '@/features/inscriptions/examenSchema'

function messagePour(note: string, bareme: number): string | undefined {
  const resultat = creerExamenSchema(bareme).safeParse({ note })

  return resultat.success ? undefined : resultat.error.issues[0]?.message
}

describe('creerExamenSchema', () => {
  it('accepte une note dans les bornes', () => {
    expect(creerExamenSchema(20).parse({ note: '15' }).note).toBe(15)
  })

  it('accepte les deux bornes', () => {
    expect(creerExamenSchema(20).parse({ note: '0' }).note).toBe(0)
    expect(creerExamenSchema(20).parse({ note: '20' }).note).toBe(20)
  })

  it('accepte la virgule décimale française', () => {
    expect(creerExamenSchema(20).parse({ note: '15,5' }).note).toBe(15.5)
  })

  it('traite un champ vide comme « pas encore examiné »', () => {
    expect(creerExamenSchema(20).parse({ note: '' }).note).toBeNull()
    expect(creerExamenSchema(20).parse({}).note).toBeNull()
  })

  it('refuse une note au-dessus du barème', () => {
    expect(messagePour('21', 20)).toBe('La note doit être comprise entre 0 et 20.')
  })

  it('refuse une note négative', () => {
    expect(messagePour('-1', 20)).toBe('La note doit être comprise entre 0 et 20.')
  })

  it('refuse ce qui n’est pas un nombre', () => {
    expect(messagePour('excellent', 20)).toBe('La note doit être comprise entre 0 et 20.')
  })

  it('borne selon le barème choisi, pas selon 20', () => {
    // 15 est valide sur 20, pas sur 10 : le message doit le dire.
    expect(messagePour('15', 10)).toBe('La note doit être comprise entre 0 et 10.')
    expect(messagePour('15', 20)).toBeUndefined()
  })
})

describe('valeurParDefaut', () => {
  it('laisse le champ vide quand aucune note n’a été donnée', () => {
    expect(valeurParDefaut(null)).toEqual({ note: '' })
  })

  it('reprend la note déjà enregistrée', () => {
    expect(valeurParDefaut(15.5)).toEqual({ note: '15.5' })
  })
})
