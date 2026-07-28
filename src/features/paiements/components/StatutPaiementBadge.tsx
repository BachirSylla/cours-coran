import { LIBELLES_STATUT_PAIEMENT, type StatutPaiement } from '@/shared/lib/paiements'
import { cn } from '@/shared/lib/utils'
import { Badge } from '@/shared/ui/badge'

/**
 * Le rouge sert à distinguer une ligne, pas à réprimander (CLAUDE.md §5.5) :
 * teintes sourdes, lisibles en clair comme en sombre.
 */
const CLASSES: Record<StatutPaiement, string> = {
  paye: 'border-transparent bg-primary/10 text-primary',
  partiel: 'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400',
  attente: 'border-dashed text-muted-foreground',
  retard: 'border-transparent bg-destructive/10 text-destructive',
}

export function StatutPaiementBadge({ statut }: { statut: StatutPaiement }) {
  return (
    <Badge variant="outline" className={cn(CLASSES[statut])}>
      {LIBELLES_STATUT_PAIEMENT[statut]}
    </Badge>
  )
}
