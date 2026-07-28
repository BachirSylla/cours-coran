import { LIBELLES_STATUT, type StatutApprenant } from '@/features/apprenants/apprenantSchema'
import { Badge } from '@/shared/ui/badge'
import { cn } from '@/shared/lib/utils'

const CLASSES: Record<StatutApprenant, string> = {
  actif: 'border-transparent bg-primary/10 text-primary',
  pause: 'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400',
  parti: 'border-transparent bg-muted text-muted-foreground',
}

/** Le statut est une chaîne libre côté base : on retombe sur « actif » si inconnu. */
function normaliser(statut: string): StatutApprenant {
  return statut === 'pause' || statut === 'parti' ? statut : 'actif'
}

export function StatutApprenantBadge({ statut }: { statut: string }) {
  const valeur = normaliser(statut)

  return (
    <Badge variant="outline" className={cn(CLASSES[valeur])}>
      {LIBELLES_STATUT[valeur]}
    </Badge>
  )
}
