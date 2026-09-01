import { describe, expect, it } from 'vitest'

import { CHEMIN_SUIVI, lienWhatsAppSuivi, urlSuivi } from '@/features/suivi/lienSuivi'

describe('urlSuivi', () => {
  it('compose une URL absolue', () => {
    expect(urlSuivi('https://exemple.app', 'abc-123')).toBe('https://exemple.app/suivi/abc-123')
  })

  it('absorbe une barre finale sur origine', () => {
    expect(urlSuivi('https://exemple.app/', 'abc')).toBe('https://exemple.app/suivi/abc')
    expect(urlSuivi('https://exemple.app///', 'abc')).toBe('https://exemple.app/suivi/abc')
  })

  it('reste aligné sur le chemin de la route', () => {
    expect(urlSuivi('https://exemple.app', 'abc')).toContain(`${CHEMIN_SUIVI}/`)
  })
})

describe('lienWhatsAppSuivi', () => {
  it('nomme l’apprenant — c’est ce qui évite d’envoyer le lien à la mauvaise famille', () => {
    const lien = lienWhatsAppSuivi('https://exemple.app/suivi/abc', 'Aïcha Diallo', 'Coran 3')

    expect(decodeURIComponent(lien)).toContain('Aïcha Diallo')
    expect(decodeURIComponent(lien)).toContain('Coran 3')
  })

  it('rappelle que le lien est personnel', () => {
    const lien = lienWhatsAppSuivi('https://exemple.app/suivi/abc', 'Aïcha', 'Coran 3')

    expect(decodeURIComponent(lien)).toContain('ne pas le transmettre')
  })

  it('encode le texte et ouvre le sélecteur de contact sans numéro', () => {
    const lien = lienWhatsAppSuivi('https://exemple.app/suivi/abc', 'Aïcha', 'Coran 3')

    expect(lien.startsWith('https://wa.me/?text=')).toBe(true)
    expect(lien).not.toContain(' ')
  })
})
