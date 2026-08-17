import { describe, expect, it } from 'vitest'

import { lienWhatsApp, urlPartage } from '@/features/partage/lienPartage'

const JETON = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

describe('urlPartage', () => {
  it('construit le lien public à partir de l’origine courante', () => {
    expect(urlPartage('https://cours-coran.vercel.app', JETON)).toBe(
      `https://cours-coran.vercel.app/c/${JETON}`
    )
  })

  it('ne double pas la barre oblique quand l’origine en porte une', () => {
    expect(urlPartage('https://cours-coran.vercel.app/', JETON)).toBe(
      `https://cours-coran.vercel.app/c/${JETON}`
    )
  })

  it('fonctionne aussi en local', () => {
    expect(urlPartage('http://localhost:5173', JETON)).toBe(`http://localhost:5173/c/${JETON}`)
  })
})

describe('lienWhatsApp', () => {
  it('encode l’URL et le libellé dans le paramètre text', () => {
    const url = urlPartage('https://cours-coran.vercel.app', JETON)
    const lien = lienWhatsApp(url, 'Mémorisation Aïcha')

    expect(lien.startsWith('https://wa.me/?text=')).toBe(true)

    // Le destinataire est choisi dans WhatsApp : aucun numéro ne transite ici.
    const texte = decodeURIComponent(lien.slice('https://wa.me/?text='.length))
    expect(texte).toContain('Mémorisation Aïcha')
    expect(texte).toContain(url)
  })

  it('échappe les caractères qui casseraient la query string', () => {
    const lien = lienWhatsApp('https://exemple.app/c/abc', 'Lecture & mémorisation ?')

    expect(lien).not.toContain(' ')
    expect(lien).toContain('%26')
    expect(lien).toContain('%3F')
  })
})
