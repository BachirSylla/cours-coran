import { useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'

import { cn } from '@/shared/lib/utils'

export interface BarreRechercheProps {
  valeur: string
  onChange: (valeur: string) => void
  placeholder: string
  /** Nom accessible — le placeholder disparaît dès qu'on tape. */
  label: string
  className?: string
}

/** Un élément où la touche « / » est un caractère, pas un raccourci. */
function estChampDeSaisie(cible: EventTarget | null): boolean {
  if (!(cible instanceof HTMLElement)) return false

  return (
    cible.isContentEditable ||
    cible instanceof HTMLInputElement ||
    cible instanceof HTMLTextAreaElement ||
    cible instanceof HTMLSelectElement
  )
}

/**
 * Champ de recherche d'une liste.
 *
 * « / » y place le curseur depuis n'importe où dans la page, comme sur la
 * plupart des outils de travail ; « Échap » l'efface. Le raccourci se tait dans
 * un champ de saisie (on y tape peut-être une date) et **quand un dialogue est
 * ouvert** — sinon il volerait le focus au formulaire qu'on est en train de
 * remplir, derrière le voile.
 */
export function BarreRecherche({
  valeur,
  onChange,
  placeholder,
  label,
  className,
}: BarreRechercheProps) {
  const champ = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function surTouche(evenement: KeyboardEvent) {
      if (evenement.key !== '/' || evenement.ctrlKey || evenement.metaKey || evenement.altKey) {
        return
      }
      if (estChampDeSaisie(evenement.target)) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return

      evenement.preventDefault()
      champ.current?.focus()
    }

    document.addEventListener('keydown', surTouche)
    return () => document.removeEventListener('keydown', surTouche)
  }, [])

  return (
    <div className={cn('relative w-full', className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />

      <input
        ref={champ}
        type="search"
        value={valeur}
        onChange={(evenement) => onChange(evenement.currentTarget.value)}
        onKeyDown={(evenement) => {
          if (evenement.key === 'Escape' && valeur !== '') {
            // Sans `stopPropagation`, un dialogue parent se fermerait aussi.
            evenement.stopPropagation()
            onChange('')
          }
        }}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
        className={cn(
          'h-10 w-full rounded-lg border border-input bg-background pr-10 pl-9 text-base shadow-xs outline-none md:text-sm',
          'transition-[color,box-shadow] placeholder:text-muted-foreground',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          // Le navigateur ajoute sa propre croix aux `type="search"` : on garde
          // la nôtre, qui suit le thème.
          '[&::-webkit-search-cancel-button]:appearance-none'
        )}
      />

      {valeur !== '' ? (
        <button
          type="button"
          onClick={() => {
            onChange('')
            champ.current?.focus()
          }}
          aria-label="Vider le champ de recherche"
          className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border bg-muted px-1.5 font-mono text-[11px] text-muted-foreground md:inline-block"
        >
          /
        </kbd>
      )}
    </div>
  )
}
