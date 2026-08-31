import { useState } from 'react'
import {
  Check,
  Copy,
  Info,
  Loader2,
  Trash2,
  TriangleAlert,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react'

import { useCours } from '@/features/cours/hooks/useCours'
import { useCreerInvitation } from '@/features/membres/hooks/useCreerInvitation'
import { useInvitations } from '@/features/membres/hooks/useInvitations'
import { useMembre } from '@/features/membres/hooks/useMembre'
import { useMembres } from '@/features/membres/hooks/useMembres'
import { useRetirerMembre } from '@/features/membres/hooks/useRetirerMembre'
import { useRevoquerInvitation } from '@/features/membres/hooks/useRevoquerInvitation'
import { etatInvitation, type Invitation } from '@/shared/supabase/invitationRepo'
import type { Membre } from '@/shared/supabase/membreRepo'
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
import { SelectNatif } from '@/shared/ui/SelectNatif'

function formaterDate(iso: string): string {
  const date = new Date(iso)
  const jour = String(date.getDate()).padStart(2, '0')
  const mois = String(date.getMonth() + 1).padStart(2, '0')

  return `${jour}/${mois}/${date.getFullYear()}`
}

/**
 * Membres du centre et invitations en cours — réservé au responsable.
 *
 * Le code d'invitation n'apparaît **qu'une fois**, ici, juste après sa
 * génération : la base n'en garde qu'une empreinte SHA-256, et la colonne n'est
 * accordée à personne en lecture. Perdu, il ne se retrouve pas — on révoque et
 * on réémet. C'est le motif des clés d'API, et il fait qu'une fuite de la table
 * ne donne accès à rien.
 *
 * Le retrait d'un membre (migration 0018) est destructif de l'**accès**, pas des
 * données : séances, présences et notes pendent du cours, jamais du membre, et
 * le compte lui-même survit. Le dialogue le dit, parce que c'est exactement la
 * question qu'on se pose à cet instant.
 */
export function SectionMembres() {
  const { userId } = useMembre()
  const { data: membres, isPending, isError, error } = useMembres()
  const invitations = useInvitations()
  const creer = useCreerInvitation()
  const revoquer = useRevoquerInvitation()
  const retirer = useRetirerMembre()
  const { data: cours } = useCours()

  const [code, setCode] = useState<string | null>(null)
  const [copie, setCopie] = useState(false)
  const [aRetirer, setARetirer] = useState<Membre | null>(null)
  const [reprend, setReprend] = useState('')

  async function copier() {
    if (!code) return

    await navigator.clipboard.writeText(code)
    setCopie(true)
    window.setTimeout(() => setCopie(false), 2000)
  }

  function inviter() {
    setCopie(false)
    creer.mutate(undefined, { onSuccess: setCode })
  }

  const listeMembres = membres ?? []

  // Un centre ne peut pas perdre son dernier responsable — la base le refuse
  // (trigger de 0012). Autant ne pas proposer le geste.
  const nombreResponsables = listeMembres.filter(
    (membre) => membre.role === 'responsable'
  ).length

  function peutRetirer(membre: Membre): boolean {
    // Sans savoir qui l'on est, on ne peut ni s'exclure soi-même de la liste, ni
    // proposer un repreneur par défaut — le sélecteur retomberait en silence sur
    // « laisser sans enseignant », qui doit rester un choix délibéré.
    if (userId === null) return false
    if (membre.user_id === userId) return false

    return membre.role !== 'responsable' || nombreResponsables > 1
  }

  // Le responsable voit tous les cours de son centre : aucune requête de plus.
  const coursDuPartant = aRetirer
    ? (cours ?? []).filter((unCours) => unCours.enseignant_id === aRetirer.user_id)
    : []

  const repreneurs = listeMembres.filter((membre) => membre.user_id !== aRetirer?.user_id)

  function ouvrirRetrait(membre: Membre) {
    setARetirer(membre)
    // Pré-rempli sur soi : le cas le plus courant est « je reprends ».
    setReprend(userId ?? '')
  }

  function confirmerRetrait() {
    if (!aRetirer) return

    retirer.mutate(
      { userId: aRetirer.user_id, reaffecterA: reprend === '' ? null : reprend },
      { onSuccess: () => setARetirer(null) }
    )
  }

  // Utilisées et expirées sont du passé : la liste ne montre que ce sur quoi le
  // responsable peut encore agir.
  const enAttente = (invitations.data ?? []).filter(
    (invitation: Invitation) => etatInvitation(invitation) === 'active'
  )

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Users className="size-4 text-muted-foreground" aria-hidden="true" />
            Enseignants du centre
          </h2>
          <p className="text-sm text-muted-foreground">
            Invitez un enseignant : il crée son compte, saisit le code, et rejoint le centre.
          </p>
        </div>

        <Button size="sm" onClick={inviter} disabled={creer.isPending}>
          {creer.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <UserPlus className="size-4" aria-hidden="true" />
          )}
          Inviter un enseignant
        </Button>
      </div>

      {creer.isError && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertDescription>{creer.error.message}</AlertDescription>
        </Alert>
      )}

      {code && (
        <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <p className="text-sm font-medium">Transmettez ce code à l'enseignant</p>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={code}
              aria-label="Code d'invitation"
              onFocus={(evenement) => evenement.currentTarget.select()}
              className="h-9 font-mono tracking-widest"
            />
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => void copier()}
              aria-label={copie ? 'Code copié' : 'Copier le code'}
              title={copie ? 'Code copié' : 'Copier le code'}
            >
              {copie ? (
                <Check className="size-4 text-primary" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Il ne s'affichera plus : la base n'en garde qu'une empreinte. Perdu, révoquez-le et
            réémettez-en un.
          </p>
        </div>
      )}

      {isPending && (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Chargement des membres…
        </p>
      )}

      {isError && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {retirer.isError && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertDescription>{retirer.error.message}</AlertDescription>
        </Alert>
      )}

      {!isPending && !isError && (
        <ul className="divide-y rounded-lg border">
          {listeMembres.map((membre) => (
            <li key={membre.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {membre.nom_affiche}
                {membre.user_id === userId && (
                  <span className="font-normal text-muted-foreground"> (vous)</span>
                )}
              </span>
              <Badge variant="outline">
                {membre.role === 'responsable' ? 'Responsable' : 'Enseignant'}
              </Badge>
              {peutRetirer(membre) && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={retirer.isPending}
                  onClick={() => ouvrirRetrait(membre)}
                  aria-label={`Retirer ${membre.nom_affiche} du centre`}
                >
                  <UserMinus className="size-4 text-destructive" aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {enAttente.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Invitations en attente</h3>

          {revoquer.isError && (
            <Alert variant="destructive">
              <TriangleAlert className="size-4" aria-hidden="true" />
              <AlertDescription>{revoquer.error.message}</AlertDescription>
            </Alert>
          )}

          <ul className="divide-y rounded-lg border">
            {enAttente.map((invitation) => (
              <li key={invitation.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 text-sm">
                  Créée le {formaterDate(invitation.created_at)}
                  <span className="text-muted-foreground">
                    {' '}
                    — expire le {formaterDate(invitation.expire_le)}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={revoquer.isPending}
                  onClick={() => revoquer.mutate(invitation.id)}
                  aria-label={`Révoquer l'invitation du ${formaterDate(invitation.created_at)}`}
                >
                  <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AlertDialog
        open={Boolean(aRetirer)}
        onOpenChange={(ouvert) => {
          if (!ouvert) setARetirer(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer ce membre du centre ?</AlertDialogTitle>
            <AlertDialogDescription>
              {aRetirer
                ? `${aRetirer.nom_affiche} n'aura plus accès au centre. Son compte est conservé : un nouveau code d'invitation le fera revenir.`
                : ''}
            </AlertDialogDescription>

            {/* Ce que le retrait NE fait pas — c'est la question qu'on se pose à
                cet instant précis. Séances, présences et notes pendent du cours,
                jamais du membre. */}
            <Alert>
              <Info className="size-4" aria-hidden="true" />
              <AlertDescription>
                Les séances, présences et notes qu'il a saisies restent intactes.
              </AlertDescription>
            </Alert>
          </AlertDialogHeader>

          {coursDuPartant.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="repreneur">
                {coursDuPartant.length > 1
                  ? `Ses ${coursDuPartant.length} cours reviennent à`
                  : 'Son cours revient à'}
              </Label>
              <SelectNatif
                id="repreneur"
                className="w-full"
                value={reprend}
                onChange={(evenement) => setReprend(evenement.currentTarget.value)}
              >
                {repreneurs.map((membre) => (
                  <option key={membre.user_id} value={membre.user_id}>
                    {membre.nom_affiche}
                    {membre.user_id === userId ? ' (vous)' : ''}
                  </option>
                ))}
                <option value="">Laisser sans enseignant</option>
              </SelectNatif>
              <p className="text-xs text-muted-foreground">
                {coursDuPartant.map((unCours) => unCours.libelle).join(', ')}
              </p>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={retirer.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(evenement) => {
                evenement.preventDefault()
                confirmerRetrait()
              }}
              disabled={retirer.isPending}
            >
              {retirer.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Alert>
        <Info className="size-4" aria-hidden="true" />
        <AlertDescription>
          Un code vaut pour <strong>une seule</strong> personne et expire au bout de 7 jours.
          Tant qu'il n'est pas utilisé, il reste révocable.
        </AlertDescription>
      </Alert>
    </section>
  )
}
