import { ChevronLeft, ChevronRight } from 'lucide-react'

import { libelleMois } from '@/shared/lib/paiements'
import { Button } from '@/shared/ui/button'

export interface NavigateurMoisProps {
  mois: string
  onPrecedent: () => void
  onSuivant: () => void
  onMoisCourant: () => void
  estMoisCourant: boolean
}

export function NavigateurMois({
  mois,
  onPrecedent,
  onSuivant,
  onMoisCourant,
  estMoisCourant,
}: NavigateurMoisProps) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={onPrecedent} aria-label="Mois précédent">
        <ChevronLeft className="size-4" aria-hidden="true" />
      </Button>

      <Button variant="outline" size="sm" onClick={onMoisCourant} disabled={estMoisCourant}>
        Mois courant
      </Button>

      <Button variant="outline" size="icon" onClick={onSuivant} aria-label="Mois suivant">
        <ChevronRight className="size-4" aria-hidden="true" />
      </Button>

      <span className="ml-1 text-sm font-medium capitalize">{libelleMois(mois)}</span>
    </div>
  )
}
