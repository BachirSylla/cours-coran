import { describe, expect, it } from 'vitest'

import { creerEvaluationSchema, valeursParDefaut } from '@/features/seances/evaluationSchema'

const sur20 = creerEvaluationSchema(20)
const sur10 = creerEvaluationSchema(10)

function messagePour(
  schema: typeof sur20,
  donnees: unknown,
  champ: string
): string | undefined {
  const resultat = schema.safeParse(donnees)
  if (resultat.success) return undefined
  return resultat.error.issues.find((issue) => issue.path[0] === champ)?.message
}

describe('creerEvaluationSchema — note', () => {
  it('transforme une note vide en null', () => {
    expect(sur20.parse({}).note).toBeNull()
    expect(sur20.parse({ note: '' }).note).toBeNull()
  })

  it('accepte les bornes du barème', () => {
    expect(sur20.parse({ note: '0' }).note).toBe(0)
    expect(sur20.parse({ note: '20' }).note).toBe(20)
    expect(sur10.parse({ note: '10' }).note).toBe(10)
  })

  it('accepte la virgule décimale française', () => {
    expect(sur20.parse({ note: '14,5' }).note).toBe(14.5)
    expect(sur20.parse({ note: '14.5' }).note).toBe(14.5)
  })

  it('accepte un nombre déjà typé', () => {
    expect(sur20.parse({ note: 12 }).note).toBe(12)
  })

  it('applique les bornes du barème fourni', () => {
    // 15 est valide sur /20 mais impossible sur /10 : c'est tout l'intérêt
    // de fabriquer le schéma avec le barème effectif.
    expect(sur20.safeParse({ note: '15' }).success).toBe(true)
    expect(sur10.safeParse({ note: '15' }).success).toBe(false)
  })

  it('donne un message mentionnant le bon barème', () => {
    expect(messagePour(sur10, { note: '15' }, 'note')).toBe(
      'La note doit être comprise entre 0 et 10.'
    )
    expect(messagePour(sur20, { note: '21' }, 'note')).toBe(
      'La note doit être comprise entre 0 et 20.'
    )
  })

  it('refuse une note négative', () => {
    expect(messagePour(sur20, { note: '-1' }, 'note')).toMatch(/entre 0 et 20/)
  })

  it('refuse une valeur non numérique', () => {
    expect(messagePour(sur20, { note: 'bien' }, 'note')).toMatch(/entre 0 et 20/)
  })
})

describe('creerEvaluationSchema — commentaire et passage', () => {
  it('transforme les champs vides en null', () => {
    const resultat = sur20.parse({ commentaire: '  ', passage_evalue: '' })

    expect(resultat.commentaire).toBeNull()
    expect(resultat.passage_evalue).toBeNull()
  })

  it('nettoie les espaces autour', () => {
    const resultat = sur20.parse({
      commentaire: '  Bonne fluidité  ',
      passage_evalue: ' Al-Baqara 1-20 ',
    })

    expect(resultat.commentaire).toBe('Bonne fluidité')
    expect(resultat.passage_evalue).toBe('Al-Baqara 1-20')
  })

  it('refuse un commentaire trop long', () => {
    expect(messagePour(sur20, { commentaire: 'a'.repeat(501) }, 'commentaire')).toMatch(
      /500 caractères/
    )
  })

  it('refuse un passage trop long', () => {
    expect(messagePour(sur20, { passage_evalue: 'a'.repeat(201) }, 'passage_evalue')).toMatch(
      /200 caractères/
    )
  })
})

describe('valeursParDefaut', () => {
  it('propose le passage suggéré quand rien n’est enregistré', () => {
    const defauts = valeursParDefaut(null, 'Al-Baqara 1-20')

    expect(defauts).toEqual({ note: '', commentaire: '', passage_evalue: 'Al-Baqara 1-20' })
    expect(sur20.safeParse(defauts).success).toBe(true)
  })

  it('reprend une évaluation existante', () => {
    const defauts = valeursParDefaut(
      { note: 14.5, commentaire: 'Bien', passage_evalue: 'Ya-Sin 1-10' },
      'ignoré'
    )

    expect(defauts).toEqual({
      note: '14.5',
      commentaire: 'Bien',
      passage_evalue: 'Ya-Sin 1-10',
    })
  })

  it('laisse tout vide sans suggestion', () => {
    expect(valeursParDefaut(null, null)).toEqual({
      note: '',
      commentaire: '',
      passage_evalue: '',
    })
  })

  it('n’écrase pas un passage enregistré par la suggestion', () => {
    const defauts = valeursParDefaut(
      { note: null, commentaire: null, passage_evalue: 'Déjà saisi' },
      'Suggestion'
    )

    expect(defauts.passage_evalue).toBe('Déjà saisi')
  })
})
