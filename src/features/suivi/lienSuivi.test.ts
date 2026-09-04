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
  it('nomme l’apprenant — c’est ce qui évite d’envoyer le lien à la mauvaise personne', () => {
    const lien = lienWhatsAppSuivi('https://exemple.app/suivi/abc', 'Aïcha Diallo')

    expect(decodeURIComponent(lien)).toContain('Aïcha Diallo')
  })

  /*
   * ⚠️ Le lien montre TOUT le parcours depuis 0025. Nommer un cours dans le
   * message laisserait croire que la page s'y arrête, et le destinataire ne
   * saurait pas qu'il en reçoit plus.
   */
  it('ne nomme aucun cours en particulier, et annonce ce qu’il montre', () => {
    const lien = decodeURIComponent(lienWhatsAppSuivi('https://exemple.app/suivi/abc', 'Aïcha'))

    expect(lien).toContain('pour tous ses cours')
    expect(lien).not.toContain('Coran 3')
  })

  it('rappelle que le lien est personnel', () => {
    const lien = lienWhatsAppSuivi('https://exemple.app/suivi/abc', 'Aïcha')

    expect(decodeURIComponent(lien)).toContain('ne pas le transmettre')
  })

  it('encode le texte et ouvre le sélecteur de contact sans numéro', () => {
    const lien = lienWhatsAppSuivi('https://exemple.app/suivi/abc', 'Aïcha')

    expect(lien.startsWith('https://wa.me/?text=')).toBe(true)
    expect(lien).not.toContain(' ')
  })
})
