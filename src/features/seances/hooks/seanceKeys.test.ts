import { describe, expect, it } from 'vitest'

import { presenceKeys, seanceKeys } from '@/features/seances/hooks/seanceKeys'

describe('seanceKeys', () => {
  /**
   * Régression : `useSeancesCours` et le rapport de session interrogent les
   * mêmes lignes, mais **pas sous la même forme** — l'un ramène des séances
   * nues, l'autre des séances avec leurs présences embarquées. Partager une
   * clé faisait servir au rapport les objets de l'autre requête, sans tableau
   * `presence`, et la page tombait sur « Cannot read properties of undefined ».
   */
  it('sépare les séances nues de celles qui portent leurs présences', () => {
    expect(seanceKeys.avecPresences('c1')).not.toEqual(seanceKeys.parCours('c1'))
  })

  it('garde la clé enrichie sous la famille des séances', () => {
    // TanStack invalide par préfixe : `seanceKeys.tous` doit continuer de la
    // couvrir, sans quoi le rapport ne se rafraîchirait jamais.
    const enrichie = seanceKeys.avecPresences('c1')

    expect(enrichie.slice(0, seanceKeys.tous.length)).toEqual([...seanceKeys.tous])
    expect(enrichie.slice(0, seanceKeys.parCours('c1').length)).toEqual([
      ...seanceKeys.parCours('c1'),
    ])
  })

  it('distingue deux cours', () => {
    expect(seanceKeys.avecPresences('c1')).not.toEqual(seanceKeys.avecPresences('c2'))
  })

  it('distingue deux plages', () => {
    expect(seanceKeys.plage('2026-03-01', '2026-03-07')).not.toEqual(
      seanceKeys.plage('2026-03-08', '2026-03-14')
    )
  })

  it('ne confond pas les familles séances et présences', () => {
    expect(seanceKeys.tous).not.toEqual(presenceKeys.tous)
  })
})
