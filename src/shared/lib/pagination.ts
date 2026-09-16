/**
 * Pagination d'une liste déjà chargée — module **pur**.
 *
 * Il ne tient aucun état : la page demandée entre, la page RÉELLE sort. C'est
 * ce qui règle le cas qu'on oublie toujours — supprimer la dernière ligne de la
 * dernière page, ou filtrer une liste qui rétrécit : la page demandée n'existe
 * plus, et l'écran afficherait une page vide sous « Page 3 sur 2 ».
 */

export const TAILLES_PAGE = [10, 25, 50] as const
export type TaillePage = (typeof TAILLES_PAGE)[number]
export const TAILLE_PAGE_PAR_DEFAUT: TaillePage = 10

/** Un numéro de page à afficher, ou une ellipse entre deux groupes. */
export type EntreePage = number | 'ellipse'

export interface Pagination {
  /** Page effectivement affichée, bornée à `[1, pages]`. */
  page: number
  /** Nombre de pages — au moins 1, même pour une liste vide. */
  pages: number
  /** Index de début (inclus) dans la liste, pour `slice`. */
  debut: number
  /** Index de fin (exclus), pour `slice`. */
  fin: number
  total: number
  /** Numéros à proposer, avec ellipses : `1 … 4 5 6 … 12`. */
  entrees: EntreePage[]
}

export function estTaillePage(valeur: number): valeur is TaillePage {
  return (TAILLES_PAGE as readonly number[]).includes(valeur)
}

/**
 * Les numéros visibles : toujours la première et la dernière page, et la page
 * courante entourée d'une voisine de chaque côté.
 *
 * ⚠️ Une ellipse ne remplace jamais UNE seule page : « 1 … 3 » cacherait le 2
 * derrière un symbole aussi large que lui. On affiche alors le numéro.
 */
function entreesPages(page: number, pages: number): EntreePage[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1)

  const visibles = new Set([1, pages, page - 1, page, page + 1])
  const tries = [...visibles].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b)

  const entrees: EntreePage[] = []
  let precedent = 0

  for (const numero of tries) {
    if (numero - precedent === 2) entrees.push(precedent + 1)
    else if (numero - precedent > 2) entrees.push('ellipse')

    entrees.push(numero)
    precedent = numero
  }

  return entrees
}

export function paginer(total: number, pageDemandee: number, taille: number): Pagination {
  const pages = Math.max(1, Math.ceil(total / taille))
  const page = Math.min(Math.max(1, Math.trunc(pageDemandee) || 1), pages)
  const debut = (page - 1) * taille

  return {
    page,
    pages,
    debut,
    fin: Math.min(debut + taille, total),
    total,
    entrees: entreesPages(page, pages),
  }
}
