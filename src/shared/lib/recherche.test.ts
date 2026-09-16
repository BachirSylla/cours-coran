import { describe, expect, it } from 'vitest'

import { correspond, normaliser } from '@/shared/lib/recherche'

describe('normaliser', () => {
  it('ôte accents et casse, et réduit les espaces', () => {
    expect(normaliser('  Pauléle   FALL ')).toBe('paulele fall')
    expect(normaliser('Tadjwîd')).toBe('tadjwid')
  })
})

describe('correspond', () => {
  const pauleleFall = ['Pauléle', 'Fall', '+221 78 631 37 70', 'Intermédiaire']

  it('laisse tout passer quand la recherche est vide', () => {
    expect(correspond('', pauleleFall)).toBe(true)
    expect(correspond('   ', pauleleFall)).toBe(true)
  })

  it('ignore accents et majuscules', () => {
    expect(correspond('paulele', pauleleFall)).toBe(true)
    expect(correspond('INTERMEDIAIRE', pauleleFall)).toBe(true)
  })

  it('trouve un fragment de mot', () => {
    expect(correspond('paul', pauleleFall)).toBe(true)
  })

  it('exige chaque mot, dans n’importe quel ordre', () => {
    expect(correspond('fall paulele', pauleleFall)).toBe(true)
    expect(correspond('fall diagne', pauleleFall)).toBe(false)
  })

  it('retrouve un numéro sans ses espaces', () => {
    expect(correspond('78631', pauleleFall)).toBe(true)
    expect(correspond('+2217863', pauleleFall)).toBe(true)
  })

  /*
   * ⚠️ Sans la garde, « a1 » se réduisait à « 1 » et trouvait tout numéro
   * contenant un 1 — c'est-à-dire presque tout le monde.
   */
  it('ne réduit pas un mot mêlé de lettres à ses chiffres', () => {
    expect(correspond('a1', pauleleFall)).toBe(false)
  })

  it('ne cherche pas dans les chiffres pour un chiffre isolé', () => {
    expect(correspond('9', ['Awa', 'Diagne', null])).toBe(false)
  })

  it('ignore les champs vides, sans correspondre au mot « null »', () => {
    expect(correspond('null', ['Awa', null, undefined])).toBe(false)
    expect(correspond('awa', ['Awa', null, undefined])).toBe(true)
  })
})
