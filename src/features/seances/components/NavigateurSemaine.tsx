import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/shared/ui/button'

export interface NavigateurSemaineProps {
  /** Lundi et dimanche de la semaine affichée, au format `AAAA-MM-JJ`. */
  debut: string
  fin: string
  onPrecedente: () => void
  onSuivante: () => void
  onAujourdhui: () => void
  /** Vrai quand la semaine affichée contient la date du jour. */
  estSemaineCourante: boolean
}

function formaterJourMois(date: string): string {
  const [, mois, jour] = date.split('-')
  return `${jour}/${mois}`
}

export function NavigateurSemaine({
  debut,
  fin,
  onPrecedente,
  onSuivante,
  onAujourdhui,
  estSemaineCourante,
}: NavigateurSemaineProps) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        onClick={onPrecedente}
        aria-label="Semaine précédente"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </Button>

      <Button variant="outline" size="sm" onClick={onAujourdhui} disabled={estSemaineCourante}>
        Aujourd’hui
      </Button>

      <Button variant="outline" size="icon" onClick={onSuivante} aria-label="Semaine suivante">
        <ChevronRight className="size-4" aria-hidden="true" />
      </Button>

      <span className="ml-1 text-sm text-muted-foreground tabular-nums">
        {formaterJourMois(debut)} – {formaterJourMois(fin)}
      </span>
    </div>
  )
}
