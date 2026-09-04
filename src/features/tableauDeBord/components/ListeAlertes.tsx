import { Link } from 'react-router'
import { AlertTriangle, ChevronRight, Info, TriangleAlert } from 'lucide-react'

import type { Alerte, GraviteAlerte } from '@/shared/lib/tableauDeBord'
import { cn } from '@/shared/lib/utils'

export interface ListeAlertesProps {
  alertes: Alerte[]
}

/**
 * Ce qui demande une action.
 *
 * La gravité se lit au **liseré**, pas à un fond coloré : trois blocs rouges
 * empilés crient tous aussi fort, et l'écran devient illisible dès qu'il y a
 * trois choses à faire. Le liseré hiérarchise sans saturer.
 */
const APPARENCE: Record<GraviteAlerte, { bord: string; teinte: string; icone: typeof Info }> = {
  urgent: { bord: 'border-l-destructive', teinte: 'text-destructive', icone: TriangleAlert },
  attention: { bord: 'border-l-chart-4', teinte: 'text-chart-4', icone: AlertTriangle },
  info: { bord: 'border-l-muted-foreground/40', teinte: 'text-muted-foreground', icone: Info },
}

export function ListeAlertes({ alertes }: ListeAlertesProps) {
  if (alertes.length === 0) return null

  return (
    <ul className="space-y-2">
      {alertes.map((alerte) => {
        const { bord, teinte, icone: Icone } = APPARENCE[alerte.gravite]

        const contenu = (
          <>
            <Icone className={cn('mt-0.5 size-4 shrink-0', teinte)} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{alerte.titre}</p>
              <p className="text-xs text-muted-foreground">{alerte.detail}</p>
            </div>
            {alerte.lien && (
              <ChevronRight
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
          </>
        )

        return (
          <li key={alerte.cle}>
            {alerte.lien ? (
              <Link
                to={alerte.lien}
                className={cn(
                  'flex gap-3 rounded-lg border border-l-4 bg-card p-3 transition-colors hover:bg-accent',
                  bord
                )}
              >
                {contenu}
              </Link>
            ) : (
              <div className={cn('flex gap-3 rounded-lg border border-l-4 bg-card p-3', bord)}>
                {contenu}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
