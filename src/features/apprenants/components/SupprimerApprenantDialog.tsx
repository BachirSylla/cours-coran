import { Loader2 } from 'lucide-react'

import type { Apprenant } from '@/shared/supabase/apprenantRepo'
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

export interface SupprimerApprenantDialogProps {
  apprenant: Apprenant | null
  onOuvertChange: (ouvert: boolean) => void
  onConfirmer: () => void
  enCours: boolean
}

export function SupprimerApprenantDialog({
  apprenant,
  onOuvertChange,
  onConfirmer,
  enCours,
}: SupprimerApprenantDialogProps) {
  return (
    <AlertDialog open={Boolean(apprenant)} onOpenChange={onOuvertChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer cet apprenant ?</AlertDialogTitle>
          <AlertDialogDescription>
            {apprenant
              ? `La fiche de ${apprenant.prenom} ${apprenant.nom} sera définitivement supprimée, ainsi que ses inscriptions aux cours. Cette action est irréversible.`
              : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={enCours}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={(evenement) => {
              // La fermeture est pilotée par le résultat de la mutation.
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
