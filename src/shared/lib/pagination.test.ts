import { describe, expect, it } from 'vitest'

import { estTaillePage, paginer } from '@/shared/lib/pagination'

describe('paginer', () => {
  it('découpe une liste en pages', () => {
    expect(paginer(23, 2, 10)).toMatchObject({
      page: 2,
      pages: 3,
      debut: 10,
      fin: 20,
      total: 23,
    })
    expect(paginer(23, 3, 10)).toMatchObject({ debut: 20, fin: 23 })
  })

  it('garde une page, même pour une liste vide', () => {
    expect(paginer(0, 1, 10)).toMatchObject({ page: 1, pages: 1, debut: 0, fin: 0 })
  })

  /*
   * ⚠️ Le cas qu'on oublie : supprimer la dernière ligne de la dernière page, ou
   * filtrer une liste qui rétrécit. La page demandée n'existe plus.
   */
  it('ramène une page devenue trop grande à la dernière page', () => {
    expect(paginer(20, 3, 10)).toMatchObject({ page: 2, debut: 10, fin: 20 })
  })

  it('borne une page nulle, négative ou invalide à la première', () => {
    expect(paginer(20, 0, 10).page).toBe(1)
    expect(paginer(20, -4, 10).page).toBe(1)
    expect(paginer(20, Number.NaN, 10).page).toBe(1)
  })

  it('montre toutes les pages quand il y en a peu', () => {
    expect(paginer(70, 1, 10).entrees).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('résume les longues listes autour de la page courante', () => {
    expect(paginer(120, 6, 10).entrees).toEqual([1, 'ellipse', 5, 6, 7, 'ellipse', 12])
    expect(paginer(120, 1, 10).entrees).toEqual([1, 2, 'ellipse', 12])
    expect(paginer(120, 12, 10).entrees).toEqual([1, 'ellipse', 11, 12])
  })

  // « 1 … 3 » cacherait le 2 derrière un symbole aussi large que lui.
  it('n’utilise jamais une ellipse pour une seule page', () => {
    expect(paginer(120, 4, 10).entrees).toEqual([1, 2, 3, 4, 5, 'ellipse', 12])
  })
})

describe('estTaillePage', () => {
  it('n’accepte que les tailles proposées', () => {
    expect(estTaillePage(25)).toBe(true)
    expect(estTaillePage(13)).toBe(false)
  })
})
