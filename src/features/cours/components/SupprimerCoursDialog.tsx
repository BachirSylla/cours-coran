import { Loader2 } from 'lucide-react'

import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'

export interface SupprimerCoursDialogProps {
  cours: CoursAvecDetails | null
  onOuvertChange: (ouvert: boolean) => void
  onConfirmer: () => void
  enCours: boolean
}

export function SupprimerCoursDialog({
  cours,
  onOuvertChange,
  onConfirmer,
  enCours,
}: SupprimerCoursDialogProps) {
  const nombreCreneaux = cours?.creneau.length ?? 0

  return (
    <AlertDialog open={Boolean(cours)} onOpenChange={onOuvertChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer ce cours ?</AlertDialogTitle>
          <AlertDialogDescription>
            {cours
              ? `« ${cours.libelle} » sera supprimé, ainsi que ${
                  nombreCreneaux > 1
                    ? `ses ${nombreCreneaux} créneaux hebdomadaires`
                    : 'son créneau hebdomadaire'
                } et les inscriptions associées. Cette action est irréversible.`
              : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={enCours}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={(evenement) => {
              evenement.preventDefault()
              onConfirmer()
            }}
            disabled={enCours}
          >
            {enCours && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
