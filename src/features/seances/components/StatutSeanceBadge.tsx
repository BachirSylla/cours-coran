import { libelleStatutSeance } from '@/features/seances/regroupement'
import type { SeanceVue } from '@/shared/lib/seances'
import type { Seance } from '@/shared/supabase/seanceRepo'
import { cn } from '@/shared/lib/utils'
import { Badge } from '@/shared/ui/badge'

const CLASSES: Record<string, string> = {
  'À saisir': 'border-dashed text-muted-foreground',
  Faite: 'border-transparent bg-primary/10 text-primary',
  Annulée: 'border-transparent bg-muted text-muted-foreground',
  Reportée: 'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400',
  Absence: 'border-transparent bg-destructive/10 text-destructive',
  'Hors planning': 'border-transparent bg-chart-3/15 text-chart-3',
}

export function StatutSeanceBadge({ vue }: { vue: SeanceVue<Seance> }) {
  const libelle = libelleStatutSeance(vue)

  return (
    <Badge variant="outline" className={cn(CLASSES[libelle])}>
      {libelle}
    </Badge>
  )
}
