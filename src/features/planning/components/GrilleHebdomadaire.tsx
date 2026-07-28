import { BlocCreneau } from '@/features/planning/components/BlocCreneau'
import {
  heuresDeLaPlage,
  libelleJour,
  abregeJour,
  PIXELS_PAR_MINUTE,
  type BlocPlanning,
  type PlageHoraire,
} from '@/features/planning/grilleHoraire'
import type { JourSemaine } from '@/shared/lib/conflits'
import { cn } from '@/shared/lib/utils'

export interface GrilleHebdomadaireProps {
  /** Jours à rendre : les 7 sur desktop, un seul sur mobile. */
  jours: JourSemaine[]
  blocs: BlocPlanning[]
  plage: PlageHoraire
  onOuvrirCours: (coursId: string) => void
  className?: string
}

/**
 * Grille hebdomadaire sur mesure (CLAUDE.md §2 : pas de librairie de calendrier).
 *
 * La structure est une grille CSS — une gouttière d'heures puis une colonne par
 * jour — et chaque bloc est positionné en absolu **dans sa colonne**, à partir
 * de ses minutes. C'est ce qui permet d'afficher un créneau 10:20–11:10 sans
 * l'aligner de force sur un pas fixe.
 */
export function GrilleHebdomadaire({
  jours,
  blocs,
  plage,
  onOuvrirCours,
  className,
}: GrilleHebdomadaireProps) {
  const heures = heuresDeLaPlage(plage)
  const hauteurTotale = (plage.finMinutes - plage.debutMinutes) * PIXELS_PAR_MINUTE

  return (
    <div
      // `grid` est une classe et non un style inline : sinon il écraserait le
      // `hidden md:grid` qui pilote l'alternance mobile / desktop.
      className={cn('grid overflow-hidden rounded-lg border bg-card', className)}
      style={{ gridTemplateColumns: `3.5rem repeat(${jours.length}, minmax(0, 1fr))` }}
    >
      {/* En-têtes */}
      <div className="border-r border-b bg-muted/50" />
      {jours.map((jour) => (
        <div
          key={`entete-${jour}`}
          className="border-b bg-muted/50 py-2 text-center text-sm font-medium last:border-r-0"
        >
          <span className="hidden sm:inline">{libelleJour(jour)}</span>
          <span className="sm:hidden">{abregeJour(jour)}</span>
        </div>
      ))}

      {/* Gouttière des heures */}
      <div className="relative border-r" style={{ height: `${hauteurTotale}px` }}>
        {heures.map((heure) => (
          <span
            key={heure}
            className="absolute right-1 -translate-y-1/2 text-[11px] text-muted-foreground tabular-nums"
            style={{
              top: `${(heure * 60 - plage.debutMinutes) * PIXELS_PAR_MINUTE}px`,
            }}
          >
            {String(heure).padStart(2, '0')}:00
          </span>
        ))}
      </div>

      {/* Une colonne par jour */}
      {jours.map((jour) => (
        <div
          key={`colonne-${jour}`}
          className="relative border-r last:border-r-0"
          style={{ height: `${hauteurTotale}px` }}
        >
          {/* Traits horaires, sous les blocs */}
          {heures.map((heure) => (
            <div
              key={heure}
              aria-hidden="true"
              className="absolute inset-x-0 border-t border-border/60"
              style={{
                top: `${(heure * 60 - plage.debutMinutes) * PIXELS_PAR_MINUTE}px`,
              }}
            />
          ))}

          {blocs
            .filter((bloc) => bloc.jour === jour)
            .map((bloc) => (
              <BlocCreneau key={bloc.creneauId} bloc={bloc} onOuvrir={onOuvrirCours} />
            ))}
        </div>
      ))}
    </div>
  )
}
