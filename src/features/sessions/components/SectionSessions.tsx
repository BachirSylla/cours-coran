import { useState } from 'react'
import {
  CalendarRange,
  Loader2,
  Lock,
  LockOpen,
  Plus,
  TriangleAlert,
} from 'lucide-react'

import { useCoursToutesSessions } from '@/features/cours/hooks/useCours'
import {
  useCreerSession,
  useModifierSession,
  useSessions,
} from '@/features/sessions/hooks/useSessions'
import type { Session } from '@/shared/supabase/sessionRepo'
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
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'

/**
 * Les sessions du centre — création, dates, clôture (migrations 0022 et 0023).
 *
 * Réservée au responsable : la session est de la **structure**. La RLS le fait
 * respecter ; ce masquage évite seulement de tendre des boutons qui échoueraient.
 *
 * Une session ne se **supprime** pas — aucune policy de DELETE n'existe. Elle se
 * renomme, ou se clôture. Supprimer poserait la question « et ses cours ? », à
 * laquelle la clé étrangère répond déjà par un refus sec et illisible.
 */
export function SectionSessions() {
  const { data: sessions, isPending, isError, error } = useSessions()
  const { data: cours } = useCoursToutesSessions()

  const creer = useCreerSession()
  const modifier = useModifierSession()

  const [creation, setCreation] = useState(false)
  const [nom, setNom] = useState('')
  const [debut, setDebut] = useState('')
  const [aCloturer, setACloturer] = useState<Session | null>(null)

  const liste = sessions ?? []

  /*
   * Les cours de la session qu'on s'apprête à clôturer et qui ne sont pas encore
   * marqués « terminé ». On AVERTIT, on ne bloque pas : un cours resté « actif »
   * par oubli ne doit pas empêcher de clore une période, mais le voir avant de
   * confirmer évite de s'en apercevoir un mois plus tard.
   */
  const coursNonTermines = aCloturer
    ? (cours ?? []).filter(
        (unCours) => unCours.session_id === aCloturer.id && unCours.statut !== 'termine'
      )
    : []

  function soumettreCreation(evenement: React.FormEvent) {
    evenement.preventDefault()
    creer.mutate(
      { nom: nom.trim(), date_debut: debut },
      {
        onSuccess: () => {
          setCreation(false)
          setNom('')
          setDebut('')
        },
      }
    )
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <CalendarRange className="size-4 text-muted-foreground" aria-hidden="true" />
            Sessions
          </h2>
          <p className="text-sm text-muted-foreground">
            Les périodes qui regroupent vos cours. Si vous n'en avez qu'une, il n'y a rien à
            faire ici — elle contient tout et ne se ferme jamais.
          </p>
        </div>

        {!creation && (
          <Button size="sm" onClick={() => setCreation(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Nouvelle session
          </Button>
        )}
      </div>

      {creation && (
        <form onSubmit={soumettreCreation} className="space-y-3 rounded-lg border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="session-nom">Nom</Label>
              <Input
                id="session-nom"
                value={nom}
                placeholder="Session 18"
                onChange={(evenement) => setNom(evenement.currentTarget.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="session-debut">Date de début</Label>
              <Input
                id="session-debut"
                type="date"
                value={debut}
                onChange={(evenement) => setDebut(evenement.currentTarget.value)}
                required
              />
            </div>
          </div>

          {creer.isError && (
            <Alert variant="destructive">
              <TriangleAlert className="size-4" aria-hidden="true" />
              <AlertDescription>{creer.error.message}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={creer.isPending}>
              {creer.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Créer
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreation(false)}>
              Annuler
            </Button>
          </div>
        </form>
      )}

      {isPending && (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Chargement des sessions…
        </p>
      )}

      {isError && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {modifier.isError && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertDescription>{modifier.error.message}</AlertDescription>
        </Alert>
      )}

      {liste.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {liste.map((session) => (
            <LigneSession
              key={session.id}
              session={session}
              nbCours={(cours ?? []).filter((c) => c.session_id === session.id).length}
              onCloturer={() => setACloturer(session)}
              onRouvrir={() =>
                modifier.mutate({ id: session.id, session: { statut: 'en_cours' } })
              }
              onDateFin={(date) =>
                modifier.mutate({ id: session.id, session: { date_fin: date } })
              }
              enCours={modifier.isPending}
            />
          ))}
        </ul>
      )}

      <Alert>
        <CalendarRange className="size-4" aria-hidden="true" />
        <AlertDescription>
          La date de fin est <strong>prévisionnelle</strong> : elle n'interdit rien et peut être
          dépassée. Seule la clôture arrête la saisie — et elle se défait d'un clic.
        </AlertDescription>
      </Alert>

      <AlertDialog
        open={Boolean(aCloturer)}
        onOpenChange={(ouvert) => {
          if (!ouvert) setACloturer(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clôturer « {aCloturer?.nom} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Plus aucune séance, présence ni note ne pourra y être saisie. Tout reste lisible,
              et le rapport reste téléchargeable. Vous pourrez la rouvrir d'un clic.
            </AlertDialogDescription>

            {/* Avertir, jamais bloquer : un cours resté « actif » par oubli ne
                doit pas empêcher de clore une période. */}
            {coursNonTermines.length > 0 && (
              <Alert>
                <TriangleAlert className="size-4" aria-hidden="true" />
                <AlertDescription className="space-y-1">
                  <span className="block">
                    {coursNonTermines.length} cours ne{coursNonTermines.length > 1 ? ' sont' : "'est"}{' '}
                    pas encore marqué{coursNonTermines.length > 1 ? 's' : ''} « terminé » :
                  </span>
                  <span className="block text-xs">
                    {coursNonTermines.map((unCours) => unCours.libelle).join(', ')}
                  </span>
                </AlertDescription>
              </Alert>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(evenement) => {
                evenement.preventDefault()
                if (aCloturer) {
                  modifier.mutate({ id: aCloturer.id, session: { statut: 'terminee' } })
                }
                setACloturer(null)
              }}
            >
              Clôturer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function LigneSession({
  session,
  nbCours,
  onCloturer,
  onRouvrir,
  onDateFin,
  enCours,
}: {
  session: Session
  nbCours: number
  onCloturer: () => void
  onRouvrir: () => void
  onDateFin: (date: string | null) => void
  enCours: boolean
}) {
  const terminee = session.statut === 'terminee'

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-sm font-medium">
          {session.nom}
          {terminee && <Badge variant="secondary">Terminée</Badge>}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          Depuis le {formaterDate(session.date_debut)}
          {session.date_fin ? ` · fin prévue le ${formaterDate(session.date_fin)}` : ''} ·{' '}
          {nbCours} cours
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor={`fin-${session.id}`} className="sr-only">
          Date de fin prévisionnelle de {session.nom}
        </Label>
        <Input
          id={`fin-${session.id}`}
          type="date"
          className="h-8 w-40"
          value={session.date_fin ?? ''}
          // Modifiable tant que la session est ouverte : une prévision se corrige.
          disabled={terminee || enCours}
          onChange={(evenement) => onDateFin(evenement.currentTarget.value || null)}
        />

        <Button
          variant="ghost"
          size="sm"
          onClick={terminee ? onRouvrir : onCloturer}
          disabled={enCours}
        >
          {terminee ? (
            <>
              <LockOpen className="size-4" aria-hidden="true" />
              Rouvrir
            </>
          ) : (
            <>
              <Lock className="size-4" aria-hidden="true" />
              Clôturer
            </>
          )}
        </Button>
      </div>
    </li>
  )
}

/** « 05/01/2026 » — même écriture que partout ailleurs dans l'application. */
function formaterDate(date: string): string {
  const [annee, mois, jour] = date.split('-')
  return annee && mois && jour ? `${jour}/${mois}/${annee}` : date
}
