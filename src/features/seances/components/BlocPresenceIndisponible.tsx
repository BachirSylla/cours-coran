import { useState } from 'react'
import { CalendarClock, Info, Loader2, TriangleAlert, Users } from 'lucide-react'

import { usePresences } from '@/features/seances/hooks/usePresences'
import { useRetirerPresences } from '@/features/seances/hooks/useRetirerPresences'
import type { RefusSaisiePresence } from '@/features/seances/seanceSchema'
import { Alert, AlertDescription } from '@/shared/ui/alert'
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
import { Button } from '@/shared/ui/button'

export interface BlocPresenceIndisponibleProps {
  refus: RefusSaisiePresence
  /** `undefined` tant que la séance n'a pas été enregistrée. */
  seanceId: string | undefined
}

/**
 * Ce qui prend la place de la présence quand la séance n'a pas eu lieu.
 *
 * Le bloc reste **visible** plutôt que d'être escamoté : une section qui
 * disparaît sans un mot se lit comme une panne, et l'enseignant chercherait où
 * sont passées ses cases. On dit pourquoi, et — s'il y a quelque chose à faire —
 * on donne le geste.
 */
export function BlocPresenceIndisponible({ refus, seanceId }: BlocPresenceIndisponibleProps) {
  const { data: presences } = usePresences(seanceId)
  const retirer = useRetirerPresences()
  const [confirmation, setConfirmation] = useState(false)

  const pointages = presences ?? []
  const notees = pointages.filter((presence) => presence.note !== null).length

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Users className="size-4 text-muted-foreground" aria-hidden="true" />
        Présence et évaluation
      </h3>

      <Alert>
        {refus === 'statut' ? (
          <>
            <Info className="size-4" aria-hidden="true" />
            <AlertDescription>
              Cette séance n'a pas eu lieu : il n'y a ni présence ni note à saisir. Indiquez la
              raison dans le champ « Motif » ci-dessus.
            </AlertDescription>
          </>
        ) : (
          <>
            <CalendarClock className="size-4" aria-hidden="true" />
            <AlertDescription>
              Cette séance n'a pas encore eu lieu. La présence se saisira le jour venu.
            </AlertDescription>
          </>
        )}
      </Alert>

      {/*
        Des pointages saisis avant le changement de statut. La base refuse de
        laisser la séance quitter « faite » tant qu'ils existent — refuser plutôt
        que supprimer en silence, parce que c'est du travail saisi. Le geste est
        donc ici, explicite, et il dit ce qu'il détruit.
      */}
      {refus === 'statut' && pointages.length > 0 && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertDescription className="space-y-2">
            <span className="block">
              {pointages.length} pointage{pointages.length > 1 ? 's' : ''} déjà saisi
              {pointages.length > 1 ? 's' : ''} sur cette séance
              {notees > 0 ? `, dont ${notees} avec une note` : ''}. L'enregistrement sera
              refusé tant qu'{pointages.length > 1 ? 'ils' : 'il'} existe
              {pointages.length > 1 ? 'nt' : ''}.
            </span>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setConfirmation(true)}
              disabled={retirer.isPending}
            >
              {retirer.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              Retirer les pointages
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {retirer.isError && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertDescription>{retirer.error.message}</AlertDescription>
        </Alert>
      )}

      <AlertDialog open={confirmation} onOpenChange={setConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer les pointages de cette séance ?</AlertDialogTitle>
            <AlertDialogDescription>
              {notees > 0
                ? `Les ${pointages.length} pointages seront supprimés, ainsi que les ${notees} note(s) et commentaire(s) qui les accompagnent. C'est définitif.`
                : 'Les pointages de présence seront supprimés. C’est définitif.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={retirer.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(evenement) => {
                evenement.preventDefault()
                if (seanceId) retirer.mutate(seanceId)
                setConfirmation(false)
              }}
            >
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
