import { useCallback, useMemo, useState, type RefObject } from 'react'

import {
  TAILLE_PAGE_PAR_DEFAUT,
  estTaillePage,
  paginer,
  type Pagination,
  type TaillePage,
} from '@/shared/lib/pagination'

function lireTaille(cle: string): TaillePage {
  try {
    const valeur = Number(window.localStorage.getItem(cle))
    return estTaillePage(valeur) ? valeur : TAILLE_PAGE_PAR_DEFAUT
  } catch {
    // Navigation privée, stockage bloqué : le défaut suffit.
    return TAILLE_PAGE_PAR_DEFAUT
  }
}

function ecrireTaille(cle: string, taille: TaillePage) {
  try {
    window.localStorage.setItem(cle, String(taille))
  } catch {
    // Préférence de confort : la perdre ne casse rien.
  }
}

export interface ListePaginee<T> {
  visibles: T[]
  pagination: Pagination
  taille: TaillePage
  allerA: (page: number) => void
  changerTaille: (taille: TaillePage) => void
  /** À appeler quand la recherche change : on repart de la première page. */
  revenirAuDebut: () => void
}

/**
 * La page affichée d'une liste, et ce qu'il faut pour en changer.
 *
 * Le calcul vit dans `paginer` (pur, testé) ; ce hook ne garde que la page
 * DEMANDÉE et la taille. La taille est retenue par appareil (`localStorage`) :
 * c'est une préférence d'écran, un téléphone et un PC n'en veulent pas la même.
 *
 * `ancre` est posée sur le haut de la liste : un changement de page y ramène.
 * Elle appartient à la page, pas au hook — une ref glissée dans l'objet rendu
 * serait lue pendant le rendu à chaque `liste.xxx`, ce que React interdit.
 */
export function useListePaginee<T>(
  elements: readonly T[],
  cleStockage: string,
  ancre: RefObject<HTMLElement | null>
): ListePaginee<T> {
  const [page, setPage] = useState(1)
  const [taille, setTaille] = useState<TaillePage>(() => lireTaille(cleStockage))

  const pagination = useMemo(
    () => paginer(elements.length, page, taille),
    [elements.length, page, taille]
  )

  const visibles = useMemo(
    () => elements.slice(pagination.debut, pagination.fin),
    [elements, pagination.debut, pagination.fin]
  )

  const allerA = useCallback(
    (cible: number) => {
      /*
       * ⚠️ On part de la page EFFECTIVE, bornée par `paginer`. La page demandée
       * peut être restée à 3 après une suppression qui n'en laisse que 2 :
       * « suivante » demanderait alors 4, toujours ramenée à 2, et le bouton
       * semblerait mort.
       */
      setPage(paginer(elements.length, cible, taille).page)

      // Ramener au haut de la liste seulement s'il est sorti de l'écran : sur
      // une liste courte, un saut de défilement serait une gêne.
      const haut = ancre.current?.getBoundingClientRect().top
      if (haut !== undefined && haut < 0) {
        ancre.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      }
    },
    [elements.length, taille, ancre]
  )

  const changerTaille = useCallback(
    (nouvelle: TaillePage) => {
      // Garder sous les yeux la première ligne qu'on regardait.
      setPage(Math.floor(pagination.debut / nouvelle) + 1)
      setTaille(nouvelle)
      ecrireTaille(cleStockage, nouvelle)
    },
    [cleStockage, pagination.debut]
  )

  const revenirAuDebut = useCallback(() => setPage(1), [])

  return { visibles, pagination, taille, allerA, changerTaille, revenirAuDebut }
}
