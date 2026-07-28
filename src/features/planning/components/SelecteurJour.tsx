import { abregeJour, JOURS_ISO } from '@/features/planning/grilleHoraire'
import type { JourSemaine } from '@/shared/lib/conflits'
import { cn } from '@/shared/lib/utils'

export interface SelecteurJourProps {
  jourActif: JourSemaine
  onChangerJour: (jour: JourSemaine) => void
  /** Jours portant un conflit : signalés même quand on regarde ailleurs. */
  joursEnConflit: Set<JourSemaine>
}

/** Barre de sélection du jour — vue mobile uniquement. */
export function SelecteurJour({
  jourActif,
  onChangerJour,
  joursEnConflit,
}: SelecteurJourProps) {
  return (
    <div
      role="tablist"
      aria-label="Jour de la semaine"
      className="flex gap-1 rounded-lg bg-muted p-1 md:hidden"
    >
      {JOURS_ISO.map((jour) => {
        const actif = jour === jourActif

        return (
          <button
            key={jour}
            type="button"
            role="tab"
            aria-selected={actif}
            onClick={() => onChangerJour(jour)}
            className={cn(
              'relative flex-1 rounded-md py-1.5 text-xs font-medium transition-colors',
              actif
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {abregeJour(jour)}
            {joursEnConflit.has(jour) && (
              <span
                className="absolute top-1 right-1 size-1.5 rounded-full bg-destructive"
                aria-label="conflit ce jour-là"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
