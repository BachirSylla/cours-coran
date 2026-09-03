import { describe, expect, it } from 'vitest'

import { nomSuivant } from '@/features/sessions/nomSuivant'

describe('nomSuivant', () => {
  it('incrémente le numéro de session', () => {
    expect(nomSuivant('Session 17')).toBe('Session 18')
    expect(nomSuivant('Session 9')).toBe('Session 10')
  })

  /*
   * Le DERNIER nombre, pas le premier : dans « Coran 2026 Session 17 », c'est 17
   * qui change de session à session, pas l'année.
   */
  it('incrémente le dernier nombre, jamais le premier', () => {
    expect(nomSuivant('Coran 2026 Session 17')).toBe('Coran 2026 Session 18')
    expect(nomSuivant('2025-2026 · période 3')).toBe('2025-2026 · période 4')
  })

  /*
   * Une numérotation qui perd son alignement se trie mal : « Session 9 » et
   * « Session 10 » se croisent dans une liste triée par nom.
   */
  it('conserve le zéro de tête', () => {
    expect(nomSuivant('Session 09')).toBe('Session 10')
    expect(nomSuivant('Session 08')).toBe('Session 09')
    expect(nomSuivant('Session 007')).toBe('Session 008')
  })

  it('respecte ce qui suit le nombre', () => {
    expect(nomSuivant('Session 17 (soir)')).toBe('Session 18 (soir)')
    expect(nomSuivant('Niveau 3 — cycle 1 bis')).toBe('Niveau 3 — cycle 2 bis')
  })

  /*
   * Sans nombre, on ne devine rien : une suggestion fausse est pire que pas de
   * suggestion, parce qu'elle se garde telle quelle. Le champ étant obligatoire,
   * rendre la main force un nom délibéré.
   *
   * Le cas est courant : « Session en cours » est le nom que le backfill de 0022
   * donne à tout centre, donc ce que verra toute PREMIÈRE reconduction.
   */
  it('ne propose rien quand il n’y a pas de nombre à incrémenter', () => {
    expect(nomSuivant('Session en cours')).toBe('')
    expect(nomSuivant('Ramadan')).toBe('')
  })

  /*
   * Au-delà de la précision entière de JavaScript, incrémenter DÉCRÉMENTE.
   * Hors d'atteinte en pratique, mais une suggestion silencieusement fausse est
   * le pire des comportements.
   */
  it('ne propose rien plutôt qu’un nombre faux', () => {
    expect(nomSuivant('Session 20250901123456789')).toBe('')
    expect(nomSuivant('Session ' + '9'.repeat(320))).toBe('')
  })

  it('taille les espaces et ne propose rien pour un nom vide', () => {
    expect(nomSuivant('  Session 17  ')).toBe('Session 18')
    expect(nomSuivant('')).toBe('')
    expect(nomSuivant('   ')).toBe('')
  })

  it('reste stable si on l’applique plusieurs fois', () => {
    expect(nomSuivant(nomSuivant(nomSuivant('Session 17')))).toBe('Session 20')
  })
})
