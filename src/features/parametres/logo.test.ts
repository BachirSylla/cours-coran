import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  calculerDimensions,
  choisirEncodage,
  MAX_COTE,
  MAX_OCTETS_ENTREE,
  redimensionnerLogo,
  SEUIL_PNG,
  validerFichierImage,
} from '@/features/parametres/logo'

function fichier(type: string, octets = 1024, nom = 'logo'): File {
  const contenu = new Uint8Array(octets)

  return new File([contenu], nom, { type })
}

describe('calculerDimensions', () => {
  it('borne le grand côté d’une image en paysage', () => {
    expect(calculerDimensions(1200, 600, 400)).toEqual({ largeur: 400, hauteur: 200 })
  })

  it('borne le grand côté d’une image en portrait', () => {
    expect(calculerDimensions(600, 1200, 400)).toEqual({ largeur: 200, hauteur: 400 })
  })

  it('préserve le rapport d’un carré', () => {
    expect(calculerDimensions(1000, 1000, 400)).toEqual({ largeur: 400, hauteur: 400 })
  })

  it('n’agrandit jamais une image déjà petite', () => {
    // L'agrandir ne gagnerait aucun détail et alourdirait la ligne.
    expect(calculerDimensions(120, 60, 400)).toEqual({ largeur: 120, hauteur: 60 })
  })

  it('ne réduit jamais un côté à zéro', () => {
    // Une bannière très allongée : la hauteur arrondirait à 0 sans plancher.
    expect(calculerDimensions(4000, 5, 400).hauteur).toBe(1)
  })

  it('utilise 400 px par défaut', () => {
    expect(calculerDimensions(2000, 1000)).toEqual({ largeur: MAX_COTE, hauteur: MAX_COTE / 2 })
  })

  it('refuse des dimensions absurdes plutôt que de produire NaN', () => {
    expect(() => calculerDimensions(0, 100)).toThrow('Dimensions invalides')
    expect(() => calculerDimensions(Number.NaN, 100)).toThrow('Dimensions invalides')
  })
})

describe('validerFichierImage', () => {
  it('accepte les trois formats prévus', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
      expect(validerFichierImage(fichier(type))).toBeNull()
    }
  })

  it('refuse un PDF', () => {
    expect(validerFichierImage(fichier('application/pdf'))).toMatch(/PNG, JPEG ou WebP/)
  })

  it('refuse un SVG', () => {
    // La base ne l'accepte pas non plus : un SVG peut porter du script.
    expect(validerFichierImage(fichier('image/svg+xml'))).toMatch(/PNG, JPEG ou WebP/)
  })

  it('refuse un fichier trop lourd', () => {
    expect(validerFichierImage(fichier('image/png', MAX_OCTETS_ENTREE + 1))).toMatch(
      /trop lourde/
    )
  })

  it('accepte un fichier pile à la limite', () => {
    expect(validerFichierImage(fichier('image/png', MAX_OCTETS_ENTREE))).toBeNull()
  })
})

describe('choisirEncodage', () => {
  it('garde le PNG quand il est léger', () => {
    const versJpeg = vi.fn(() => 'jpeg')

    expect(choisirEncodage('png-court', versJpeg)).toBe('png-court')
    // Le JPEG n'est même pas encodé : inutile de le calculer pour rien.
    expect(versJpeg).not.toHaveBeenCalled()
  })

  it('bascule en JPEG au-delà du seuil', () => {
    const png = 'x'.repeat(SEUIL_PNG + 1)

    expect(choisirEncodage(png, () => 'jpeg-court')).toBe('jpeg-court')
  })

  it('garde le PNG si le JPEG s’avère plus lourd', () => {
    const png = 'x'.repeat(SEUIL_PNG + 1)
    const jpeg = 'y'.repeat(SEUIL_PNG + 500)

    expect(choisirEncodage(png, () => jpeg)).toBe(png)
  })
})

/**
 * Le canvas de jsdom ne dessine rien : `getContext` renvoie `null` et
 * `toDataURL` une chaîne vide. Les bouchons restent **locaux à ce fichier** —
 * `src/test/setup.ts` ne comble que de véritables absences globales, pas des
 * implémentations volontairement inertes.
 */
describe('redimensionnerLogo', () => {
  const drawImage = vi.fn()
  let toDataURL: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    toDataURL = vi.fn((type: string) => `data:${type};base64,AAAA`)

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(
      toDataURL as unknown as HTMLCanvasElement['toDataURL']
    )

    // jsdom ne charge aucune ressource : `onload` ne partirait jamais seul.
    vi.stubGlobal(
      'Image',
      class {
        width = 1200
        height = 600
        onload: (() => void) | null = null
        onerror: (() => void) | null = null

        set src(_valeur: string) {
          queueMicrotask(() => this.onload?.())
        }
      }
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('produit une data URL d’image', async () => {
    const resultat = await redimensionnerLogo(fichier('image/png'))

    expect(resultat).toMatch(/^data:image\/(png|jpeg);base64,/)
  })

  it('dessine aux dimensions bornées', async () => {
    await redimensionnerLogo(fichier('image/png'))

    // 1200 × 600 ramené sous 400 px de grand côté.
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 400, 200)
  })

  it('refuse un format non pris en charge avant tout traitement', async () => {
    await expect(redimensionnerLogo(fichier('application/pdf'))).rejects.toThrow(
      /PNG, JPEG ou WebP/
    )
    expect(drawImage).not.toHaveBeenCalled()
  })

  it('bascule en JPEG quand le PNG est trop lourd', async () => {
    toDataURL.mockImplementation((type: string) =>
      type === 'image/png'
        ? `data:image/png;base64,${'A'.repeat(SEUIL_PNG)}`
        : 'data:image/jpeg;base64,AAAA'
    )

    await expect(redimensionnerLogo(fichier('image/png'))).resolves.toMatch(
      /^data:image\/jpeg;base64,/
    )
  })

  it('signale clairement un canvas indisponible', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

    await expect(redimensionnerLogo(fichier('image/png'))).rejects.toThrow(
      "Cette image n'a pas pu être préparée."
    )
  })
})
