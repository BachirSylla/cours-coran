import { useState } from 'react'
import { CopyPlus, Loader2, TriangleAlert } from 'lucide-react'

import { useReconduireSession } from '@/features/sessions/hooks/useSessions'
import { nomSuivant } from '@/features/sessions/nomSuivant'
import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'
import type { Session } from '@/shared/supabase/sessionRepo'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'

export interface ReconduireSessionDialogProps {
  /** `null` = fermé. */
  source: Session | null
  /** Tous les cours du centre : on en tire l'aperçu de ce qui sera recopié. */
  cours: CoursAvecDetails[]
  onOuvertChange: (ouvert: boolean) => void
}

/**
 * « Ouvrir la session suivante » — la reconduction (migration 0024).
 *
 * L'écran doit dire **exactement** ce qui sera recopié et ce qui ne le sera pas.
 * C'est un geste qui crée d'un coup une dizaine de cours : la surprise n'y a pas
 * sa place, et « ça recopie la session » ne suffirait pas à savoir si les
 * apprenants suivent.
 */
export function ReconduireSessionDialog({
  source,
  cours,
  onOuvertChange,
}: ReconduireSessionDialogProps) {
  return (
    <Dialog open={Boolean(source)} onOpenChange={onOuvertChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {/* Monté avec une `key` : le nom suggéré et la date s'initialisent à
            l'ouverture, sans effet de synchronisation. */}
        {source && (
          <ContenuReconduction
            key={source.id}
            source={source}
            cours={cours}
            onOuvertChange={onOuvertChange}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ContenuReconduction({
  source,
  cours,
  onOuvertChange,
}: {
  source: Session
  cours: CoursAvecDetails[]
  onOuvertChange: (ouvert: boolean) => void
}) {
  const reconduire = useReconduireSession()

  const [nom, setNom] = useState(() => nomSuivant(source.nom))
  const [debut, setDebut] = useState('')
  const [fin, setFin] = useState('')

  const aRecopier = cours.filter((unCours) => unCours.session_id === source.id)
  const nbCreneaux = aRecopier.reduce((total, unCours) => total + unCours.creneau.length, 0)
  const sansEnseignant = aRecopier.filter((unCours) => unCours.enseignant_id === null).length

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault()
    reconduire.mutate(
      {
        sessionSourceId: source.id,
        nom: nom.trim(),
        dateDebut: debut,
        dateFin: fin === '' ? null : fin,
      },
      { onSuccess: () => onOuvertChange(false) }
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Ouvrir la session suivante</DialogTitle>
        <DialogDescription>
          Les cours de « {source.nom} » sont recopiés dans une nouvelle session. « {source.nom} »
          n'est pas modifiée.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={soumettre} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="reconduction-nom">Nom de la nouvelle session</Label>
            <Input
              id="reconduction-nom"
              value={nom}
              placeholder="Session 18"
              onChange={(evenement) => setNom(evenement.currentTarget.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reconduction-debut">Date de début</Label>
            <Input
              id="reconduction-debut"
              type="date"
              value={debut}
              onChange={(evenement) => setDebut(evenement.currentTarget.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reconduction-fin">
            Date de fin <span className="font-normal text-muted-foreground">(facultative)</span>
          </Label>
          <Input
            id="reconduction-fin"
            type="date"
            value={fin}
            onChange={(evenement) => setFin(evenement.currentTarget.value)}
          />
          {/* La date de début est libre : rien n'oblige à enchaîner. */}
          <p className="text-xs text-muted-foreground">
            La nouvelle session peut commencer quand vous voulez — des vacances entre les deux
            sont permises.
          </p>
        </div>

        {aRecopier.length === 0 ? (
          <Alert>
            <TriangleAlert className="size-4" aria-hidden="true" />
            <AlertDescription>
              « {source.nom} » ne contient aucun cours : la nouvelle session sera vide.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-2 rounded-lg border p-3 text-sm">
            <p className="font-medium">
              {aRecopier.length} cours et {nbCreneaux} créneau
              {nbCreneaux > 1 ? 'x' : ''} seront recopiés
            </p>
            <p className="text-muted-foreground">
              Libellé, type, niveau, format, enseignant affecté, horaires, réglages de notation et
              tarif.
            </p>
            {/*
              Dire ce qui NE suit pas est au moins aussi important : c'est ce qui
              distingue « ouvrir la suite » de « dupliquer », et personne ne doit
              découvrir après coup que les apprenants n'ont pas suivi.
            */}
            <p className="text-muted-foreground">
              <strong className="font-medium text-foreground">Ne suivent pas :</strong> les
              apprenants inscrits, les séances, les présences, les notes et les examens — ils
              restent dans « {source.nom} ». Ni le lien de visioconférence, ni le lien de partage.
            </p>
            {sansEnseignant > 0 && (
              <p className="text-muted-foreground">
                {sansEnseignant > 1
                  ? `${sansEnseignant} cours sont sans enseignant affecté : ils le resteront.`
                  : '1 cours est sans enseignant affecté : il le restera.'}
              </p>
            )}
          </div>
        )}

        {reconduire.isError && (
          <Alert variant="destructive">
            <TriangleAlert className="size-4" aria-hidden="true" />
            <AlertDescription>{reconduire.error.message}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOuvertChange(false)}>
            Annuler
          </Button>
          <Button type="submit" disabled={reconduire.isPending}>
            {reconduire.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <CopyPlus className="size-4" aria-hidden="true" />
            )}
            Ouvrir la session
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
