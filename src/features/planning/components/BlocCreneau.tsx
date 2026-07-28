import { ExternalLink, TriangleAlert, Users } from 'lucide-react'

import type { BlocPlanning } from '@/features/planning/grilleHoraire'
import { cn } from '@/shared/lib/utils'

/**
 * Classes statiques (et non construites dynamiquement) : Tailwind analyse le
 * source, une classe assemblée à l'exécution ne serait jamais générée.
 */
const CLASSES_COULEUR: Record<number, string> = {
  1: 'border-l-chart-1 bg-chart-1/10 hover:bg-chart-1/20',
  2: 'border-l-chart-2 bg-chart-2/10 hover:bg-chart-2/20',
  3: 'border-l-chart-3 bg-chart-3/10 hover:bg-chart-3/20',
  4: 'border-l-chart-4 bg-chart-4/10 hover:bg-chart-4/20',
  5: 'border-l-chart-5 bg-chart-5/10 hover:bg-chart-5/20',
}

export interface BlocCreneauProps {
  bloc: BlocPlanning
  onOuvrir: (coursId: string) => void
}

export function BlocCreneau({ bloc, onOuvrir }: BlocCreneauProps) {
  const largeur = 100 / bloc.nbVoies
  const compact = bloc.hauteur < 48

  return (
    // Conteneur positionné en pourcentages purs : la gouttière de 2 px vient de
    // son padding, ce qui évite un `calc()` mêlant % et px en style inline.
    <div
      className="absolute p-[2px]"
      style={{
        top: `${bloc.top}px`,
        height: `${Math.max(bloc.hauteur, 22)}px`,
        left: `${bloc.voie * largeur}%`,
        width: `${largeur}%`,
      }}
    >
      <button
        type="button"
        onClick={() => onOuvrir(bloc.coursId)}
        aria-label={`${bloc.libelle}, ${bloc.heureDebut} à ${bloc.heureFin}${
          bloc.enConflit ? ', en conflit avec un autre cours' : ''
        }`}
        className={cn(
          'h-full w-full overflow-hidden rounded-md border border-l-4 p-1.5 text-left transition-colors',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          bloc.enConflit
            ? 'border-destructive bg-destructive/10 hover:bg-destructive/20'
            : CLASSES_COULEUR[bloc.couleur]
        )}
      >
        <span className="flex items-start gap-1">
          {bloc.enConflit && (
            <TriangleAlert
              className="mt-0.5 size-3 shrink-0 text-destructive"
              aria-hidden="true"
            />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs leading-tight font-medium">
              {bloc.libelle}
            </span>
            {!compact && (
              <>
                <span className="block truncate text-[11px] leading-tight text-muted-foreground tabular-nums">
                  {bloc.heureDebut}–{bloc.heureFin}
                </span>
                {bloc.typeLibelle && (
                  <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                    {bloc.typeLibelle}
                  </span>
                )}
                {bloc.nbInscrits > 0 && bloc.hauteur >= 72 && (
                  <span className="mt-0.5 flex items-center gap-1 text-[11px] leading-tight text-muted-foreground">
                    <Users className="size-3 shrink-0" aria-hidden="true" />
                    {bloc.nbInscrits}
                  </span>
                )}
              </>
            )}
          </span>

          {bloc.lienMeet && !compact && (
            // Le lien vit dans le bloc cliquable : sans stopPropagation, ouvrir
            // le Meet déclencherait aussi l'édition du cours.
            <a
              href={bloc.lienMeet}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(evenement) => evenement.stopPropagation()}
              aria-label={`Ouvrir le lien de ${bloc.libelle}`}
              title="Ouvrir le lien de visioconférence"
              className="shrink-0 rounded p-0.5 hover:bg-background/80"
            >
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          )}
        </span>
      </button>
    </div>
  )
}
