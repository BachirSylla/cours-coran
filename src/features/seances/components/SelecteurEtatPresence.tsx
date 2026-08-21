import { ChevronDown } from 'lucide-react'

import { ETATS_PRESENCE, LIBELLES_ETAT, type EtatPresence } from '@/shared/lib/rapport'
import { cn } from '@/shared/lib/utils'

export interface SelecteurEtatPresenceProps {
  /** État **effectif** : celui de la ligne, ou celui déduit du booléen. */
  valeur: EtatPresence
  nomComplet: string
  onChoisir: (etat: EtatPresence) => void
  desactive?: boolean
}

/**
 * Précise l'état de présence d'un apprenant — facultatif : la case à cocher
 * suffit à qui n'a pas besoin de nuance.
 *
 * `<select>` **natif**, et non le `Select` de shadcn/ui, contrairement au reste
 * des formulaires. C'est un choix lié à l'endroit où il vit — une ligne de liste
 * répétée, sur mobile :
 *
 * - le sélecteur natif s'ouvre en pleine largeur, à portée du pouce, avec les
 *   libellés entiers, là où un popover ancré à droite d'une ligne étroite se bat
 *   avec le bord de l'écran ;
 * - il y a une instance **par apprenant inscrit** : autant de portails, de
 *   verrous de défilement et d'`aria-hidden` sur toute l'application, pour un
 *   choix à cinq valeurs ;
 * - clavier et lecteurs d'écran fonctionnent sans rien câbler.
 */
export function SelecteurEtatPresence({
  valeur,
  nomComplet,
  onChoisir,
  desactive = false,
}: SelecteurEtatPresenceProps) {
  return (
    <div className="relative">
      <select
        aria-label={`État de présence de ${nomComplet}`}
        value={valeur}
        disabled={desactive}
        onChange={(evenement) => onChoisir(evenement.currentTarget.value as EtatPresence)}
        className={cn(
          'h-8 appearance-none rounded-md border border-input bg-transparent py-1 pr-7 pl-2.5',
          'text-xs whitespace-nowrap transition-colors',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
      >
        {ETATS_PRESENCE.map((etat) => (
          <option key={etat} value={etat}>
            {LIBELLES_ETAT[etat]}
          </option>
        ))}
      </select>

      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  )
}
