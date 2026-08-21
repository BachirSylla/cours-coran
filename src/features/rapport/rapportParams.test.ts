import { describe, expect, it } from 'vitest'

import {
  ecrireRapportParams,
  lireRapportParams,
  PARAMS_VIDES,
  urlRapport,
} from '@/features/rapport/rapportParams'

describe('lireRapportParams', () => {
  it('lit une query string complète', () => {
    expect(
      lireRapportParams('du=2026-03-15&au=2026-07-19&niveau=9&session=16&centre=Dakar')
    ).toEqual({
      du: '2026-03-15',
      au: '2026-07-19',
      niveau: '9',
      session: '16',
      centre: 'Dakar',
    })
  })

  it('retombe sur tout le cours quand rien n’est précisé', () => {
    expect(lireRapportParams('')).toEqual(PARAMS_VIDES)
  })

  it('ignore une date mal formée plutôt que d’échouer', () => {
    // Une URL tronquée à la main doit produire un rapport, pas un écran d'erreur.
    expect(lireRapportParams('du=hier&au=2026-07-19')).toMatchObject({
      du: null,
      au: '2026-07-19',
    })
  })

  it('ignore les paramètres inconnus', () => {
    expect(lireRapportParams('du=2026-03-15&pirate=1')).toEqual({
      ...PARAMS_VIDES,
      du: '2026-03-15',
    })
  })

  it('ramène un champ vide à null', () => {
    expect(lireRapportParams('niveau=&centre=%20%20')).toMatchObject({
      niveau: null,
      centre: null,
    })
  })

  it('accepte aussi un URLSearchParams', () => {
    expect(lireRapportParams(new URLSearchParams({ session: '16' })).session).toBe('16')
  })
})

describe('ecrireRapportParams', () => {
  it('omet les champs vides', () => {
    expect(ecrireRapportParams({ ...PARAMS_VIDES, niveau: '9' })).toBe('niveau=9')
  })

  it('ne produit rien quand tout est vide', () => {
    expect(ecrireRapportParams(PARAMS_VIDES)).toBe('')
  })

  it('encode les valeurs', () => {
    expect(ecrireRapportParams({ ...PARAMS_VIDES, centre: 'Dakar Plateau' })).toContain(
      'Dakar+Plateau'
    )
  })
})

describe('urlRapport', () => {
  it('construit l’URL du rapport', () => {
    expect(urlRapport('c1', { ...PARAMS_VIDES, du: '2026-03-15', session: '16' })).toBe(
      '/cours/c1/rapport?du=2026-03-15&session=16'
    )
  })

  it('n’ajoute pas de point d’interrogation inutile', () => {
    expect(urlRapport('c1', PARAMS_VIDES)).toBe('/cours/c1/rapport')
  })

  it('fait un aller-retour sans rien perdre', () => {
    const params = {
      du: '2026-03-15',
      au: '2026-07-19',
      niveau: '9',
      session: '16',
      centre: 'Dakar',
    }

    expect(lireRapportParams(ecrireRapportParams(params))).toEqual(params)
  })
})
