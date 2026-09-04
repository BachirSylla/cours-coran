import type { LucideIcon } from 'lucide-react'

import { cn } from '@/shared/lib/utils'

export interface TuileChiffreProps {
  libelle: string
  /** Déjà formaté : montant, pourcentage ou nombre. */
  valeur: string
  /** Précision sous le chiffre — période couverte, comparaison, unité. */
  detail?: string
  icone: LucideIcon
  /**
   * Met la tuile en avant. **Une seule par écran** : deux accents ne se
   * hiérarchisent plus, et l'œil ne sait plus où se poser.
   */
  accent?: boolean
  /** Grise la tuile quand la valeur n'a pas de sens (rien à mesurer). */
  vide?: boolean
}

/**
 * Un chiffre-clé.
 *
 * Le chiffre passe avant son libellé — c'est ce qu'on vient lire — et il est en
 * `tabular-nums` pour que quatre tuiles côte à côte alignent leurs colonnes.
 * L'icône reste discrète : elle situe, elle n'illustre pas.
 */
export function TuileChiffre({
  libelle,
  valeur,
  detail,
  icone: Icone,
  accent = false,
  vide = false,
}: TuileChiffreProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border p-4 transition-shadow hover:shadow-sm',
        accent ? 'border-primary/30 bg-primary/5' : 'bg-card'
      )}
    >
      {/* Voile décoratif : donne du relief à la tuile accentuée sans ajouter de
          couleur au texte, qui doit rester lisible dans les deux thèmes. */}
      {accent && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-8 -right-8 size-24 rounded-full bg-primary/10 blur-2xl"
        />
      )}

      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {libelle}
        </p>
        <Icone
          className={cn('size-4 shrink-0', accent ? 'text-primary' : 'text-muted-foreground')}
          aria-hidden="true"
        />
      </div>

      <p
        className={cn(
          'mt-2 text-2xl leading-tight font-semibold tabular-nums',
          vide && 'text-muted-foreground'
        )}
      >
        {valeur}
      </p>

      {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
    </div>
  )
}
