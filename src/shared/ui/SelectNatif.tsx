import * as React from 'react'

import { cn } from '@/shared/lib/utils'

/**
 * Liste déroulante **native**, habillée aux couleurs de l'application.
 *
 * Le projet utilise le `Select` de shadcn/ui dans ses formulaires, mais un
 * `<select>` natif reste préférable là où il y a une instance par ligne de
 * liste, ou sur mobile : il ouvre le sélecteur du système, en pleine largeur et
 * à portée du pouce, sans portail ni verrou de défilement.
 *
 * **Le fond doit être opaque, et les options colorées explicitement.** Un
 * `<select>` dont le `background-color` calculé vaut `transparent` — ou une
 * couleur translucide comme le `dark:bg-input/30` du composant `Input` — fait
 * peindre la liste d'options sur du blanc par Chrome, alors que le texte hérite
 * du `color` du select : blanc sur blanc en thème sombre, lisible seulement sous
 * le curseur. C'est la raison d'être de ce composant, et de sa centralisation :
 * la règle n'a plus à être retenue à chaque usage.
 *
 * La flèche reste celle du système : sa couleur suit `color-scheme`, ce qui est
 * plus sûr qu'un chevron dessiné à la main par-dessus un `appearance-none`.
 */
function SelectNatif({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="select-natif"
      className={cn(
        'h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        // Chrome et Firefox respectent ces couleurs sur les options ; macOS les
        // ignore, mais y honore `color-scheme`, donc le rendu y est déjà bon.
        '[&_option]:bg-popover [&_option]:text-popover-foreground',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export { SelectNatif }
