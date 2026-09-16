import { ChevronLeft, ChevronRight } from 'lucide-react'

import {
  TAILLES_PAGE,
  estTaillePage,
  type Pagination,
  type TaillePage,
} from '@/shared/lib/pagination'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { SelectNatif } from '@/shared/ui/SelectNatif'

export interface PaginationListeProps {
  pagination: Pagination
  taille: TaillePage
  onPage: (page: number) => void
  onTaille: (taille: TaillePage) => void
  /** « apprenant » / « apprenants » — ce que compte la liste. */
  singulier: string
  pluriel: string
}

/**
 * Pied de liste : où l'on est, combien il y en a, et comment aller ailleurs.
 *
 * Ce qui ne sert à rien se tait : pas de navigation pour une seule page, pas de
 * choix de taille tant que la liste tient dans la plus petite. Le résumé, lui,
 * reste — après une recherche, « 3 apprenants » est la réponse.
 *
 * Sur téléphone, les numéros cèdent la place à « 2 / 5 » entre deux grandes
 * flèches : une rangée de petits chiffres ne se vise pas au pouce.
 */
export function PaginationListe({
  pagination,
  taille,
  onPage,
  onTaille,
  singulier,
  pluriel,
}: PaginationListeProps) {
  const { page, pages, debut, fin, total, entrees } = pagination

  if (total === 0) return null

  const nom = total > 1 ? pluriel : singulier
  const resume = pages > 1 ? `${debut + 1}–${fin} sur ${total} ${nom}` : `${total} ${nom}`

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col-reverse items-center justify-between gap-3 sm:flex-row"
    >
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <p aria-live="polite" className="tabular-nums">
          {resume}
        </p>

        {total > TAILLES_PAGE[0] && (
          <SelectNatif
            aria-label="Lignes par page"
            value={taille}
            onChange={(evenement) => {
              const valeur = Number(evenement.currentTarget.value)
              if (estTaillePage(valeur)) onTaille(valeur)
            }}
            className="h-8 px-2 text-xs"
          >
            {TAILLES_PAGE.map((option) => (
              <option key={option} value={option}>
                {option} par page
              </option>
            ))}
          </SelectNatif>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPage(page - 1)}
            disabled={page === 1}
            aria-label="Page précédente"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>

          <span className="px-3 text-sm tabular-nums sm:hidden">
            {page} / {pages}
          </span>

          <ul className="hidden items-center gap-1 sm:flex">
            {entrees.map((entree, index) =>
              entree === 'ellipse' ? (
                <li
                  // Deux ellipses au plus, jamais au même rang.
                  key={`ellipse-${index}`}
                  aria-hidden="true"
                  className="w-6 text-center text-sm text-muted-foreground"
                >
                  …
                </li>
              ) : (
                <li key={entree}>
                  <Button
                    variant={entree === page ? 'default' : 'ghost'}
                    size="icon-sm"
                    onClick={() => onPage(entree)}
                    aria-label={`Page ${entree}`}
                    aria-current={entree === page ? 'page' : undefined}
                    className={cn('tabular-nums', entree !== page && 'text-muted-foreground')}
                  >
                    {entree}
                  </Button>
                </li>
              )
            )}
          </ul>

          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPage(page + 1)}
            disabled={page === pages}
            aria-label="Page suivante"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    </nav>
  )
}
