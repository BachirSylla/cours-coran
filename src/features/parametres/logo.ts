/**
 * Préparation du logo du centre avant enregistrement.
 *
 * L'image est redimensionnée et ré-encodée **dans le navigateur** : elle finit
 * dans une colonne `text` (migration 0010), pas dans un bucket. Une photo de
 * téléphone y entrerait telle quelle sans ce passage.
 *
 * Les trois premières fonctions sont pures ; seule `redimensionnerLogo` touche
 * au canvas.
 */

/**
 * Grand côté après redimensionnement. 400 px suffisent à rester net dans un
 * en-tête imprimé de 12 mm de haut, et laissent une marge confortable sous la
 * borne de 200 000 caractères imposée par la base.
 */
export const MAX_COTE = 400

/** Au-delà, on suppose une photo : le PNG y serait démesuré (voir `choisirEncodage`). */
export const SEUIL_PNG = 60_000

/** Qualité JPEG de repli — invisible sur un logo, et divise la taille par cinq. */
export const QUALITE_JPEG = 0.85

/** Poids maximal du fichier **d'entrée**, avant redimensionnement. */
export const MAX_OCTETS_ENTREE = 8 * 1024 * 1024

/**
 * Le SVG est absent volontairement : la contrainte en base ne l'accepte pas, et
 * un SVG peut porter du script — ce que `<img>` n'exécute pas, mais qu'on ne
 * stocke pas pour autant.
 */
export const TYPES_ACCEPTES = ['image/png', 'image/jpeg', 'image/webp'] as const

export interface Dimensions {
  largeur: number
  hauteur: number
}

/**
 * Ramène l'image dans un carré de `maxCote`, en conservant ses proportions.
 * Une image déjà plus petite est **laissée telle quelle** : l'agrandir ne
 * gagnerait aucun détail et alourdirait la ligne pour rien.
 */
export function calculerDimensions(
  largeur: number,
  hauteur: number,
  maxCote = MAX_COTE
): Dimensions {
  if (largeur <= 0 || hauteur <= 0 || !Number.isFinite(largeur) || !Number.isFinite(hauteur)) {
    throw new Error(`Dimensions invalides : ${largeur}×${hauteur}`)
  }

  const facteur = Math.min(1, maxCote / Math.max(largeur, hauteur))

  return {
    largeur: Math.max(1, Math.round(largeur * facteur)),
    hauteur: Math.max(1, Math.round(hauteur * facteur)),
  }
}

/** `null` si le fichier convient, sinon la raison du refus, en français. */
export function validerFichierImage(fichier: File): string | null {
  if (!(TYPES_ACCEPTES as readonly string[]).includes(fichier.type)) {
    return 'Format non pris en charge. Choisissez une image PNG, JPEG ou WebP.'
  }

  if (fichier.size > MAX_OCTETS_ENTREE) {
    const maximum = Math.round(MAX_OCTETS_ENTREE / (1024 * 1024))
    return `Image trop lourde. Choisissez un fichier de moins de ${maximum} Mo.`
  }

  return null
}

/**
 * Choisit l'encodage final.
 *
 * Un logo à aplats reste en PNG : plus net, et sa transparence est conservée.
 * Une photographie y pèserait un multiple de son équivalent JPEG — au-delà du
 * seuil, on bascule donc, quitte à perdre la transparence qu'une photo n'a pas.
 *
 * `versJpeg` est passée en paramètre plutôt qu'appelée directement : le JPEG
 * n'est encodé que s'il sert.
 */
export function choisirEncodage(png: string, versJpeg: () => string): string {
  if (png.length <= SEUIL_PNG) return png

  const jpeg = versJpeg()

  // Cas limite : sur une très petite image, le JPEG peut être le plus lourd.
  return jpeg.length < png.length ? jpeg : png
}

/**
 * Redimensionne et ré-encode une image en data URL prête à stocker.
 *
 * Lève une erreur au message lisible plutôt qu'un `null` silencieux : l'écran
 * doit pouvoir dire ce qui n'a pas marché.
 */
export async function redimensionnerLogo(fichier: File, maxCote = MAX_COTE): Promise<string> {
  const refus = validerFichierImage(fichier)
  if (refus) throw new Error(refus)

  const source = await lireDataUrl(fichier)
  const image = await chargerImage(source)

  const { largeur, hauteur } = calculerDimensions(image.width, image.height, maxCote)

  const canevas = document.createElement('canvas')
  canevas.width = largeur
  canevas.height = hauteur

  const contexte = canevas.getContext('2d')
  if (!contexte) throw new Error("Cette image n'a pas pu être préparée.")

  contexte.drawImage(image, 0, 0, largeur, hauteur)

  return choisirEncodage(canevas.toDataURL('image/png'), () =>
    canevas.toDataURL('image/jpeg', QUALITE_JPEG)
  )
}

function lireDataUrl(fichier: File): Promise<string> {
  return new Promise((resoudre, rejeter) => {
    const lecteur = new FileReader()

    lecteur.onload = () => resoudre(String(lecteur.result))
    lecteur.onerror = () => rejeter(new Error("Ce fichier n'a pas pu être lu."))
    lecteur.readAsDataURL(fichier)
  })
}

function chargerImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resoudre, rejeter) => {
    const image = new Image()

    image.onload = () => resoudre(image)
    image.onerror = () => rejeter(new Error("Ce fichier n'est pas une image lisible."))
    image.src = source
  })
}
