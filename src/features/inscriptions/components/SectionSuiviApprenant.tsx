import { useState } from 'react'
import {
  Check,
  Copy,
  Link2Off,
  Loader2,
  MessageCircle,
  RefreshCw,
  TriangleAlert,
  UserRoundCheck,
} from 'lucide-react'

import { useInscriptionsCours } from '@/features/inscriptions/hooks/useInscriptionsCours'
import {
  useActiverSuivi,
  useRegenererSuivi,
  useRevoquerSuivi,
  type CibleSuivi,
} from '@/features/suivi/hooks/useLienSuivi'
import { lienWhatsAppSuivi, urlSuivi } from '@/features/suivi/lienSuivi'
import type { InscriptionAvecApprenant } from '@/shared/supabase/inscriptionRepo'
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
import { Input } from '@/shared/ui/input'

export interface SectionSuiviApprenantProps {
  coursId: string
  libelle: string
}

/**
 * Liens de suivi privés, un par apprenant inscrit.
 *
 * Un lien par inscription, jamais un pour le cours : ce qu'il ouvre, ce sont
 * les notes d'**une** personne. Les envoyer à la bonne famille est la
 * responsabilité de l'enseignant — d'où le nom dans le message WhatsApp, et le
 * rappel que le lien est personnel.
 */
export function SectionSuiviApprenant({ coursId, libelle }: SectionSuiviApprenantProps) {
  const { data: inscriptions, isPending } = useInscriptionsCours(coursId)

  const inscrits = inscriptions ?? []

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <UserRoundCheck className="size-4 text-muted-foreground" aria-hidden="true" />
        Suivi des familles
      </h3>

      <p className="text-xs text-muted-foreground">
        Chaque lien ouvre une page privée montrant les notes de récitation, l'assiduité et les
        exercices de <strong>cet apprenant seulement</strong>, sans compte à créer. Ni les
        autres apprenants, ni les paiements n'y figurent. Les séances à venir non plus : rien
        n'est publié avant d'avoir eu lieu.
      </p>

      {isPending && (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Chargement des apprenants…
        </p>
      )}

      {!isPending && inscrits.length === 0 && (
        <p className="rounded-lg border border-dashed px-4 py-4 text-center text-sm text-muted-foreground">
          Aucun apprenant inscrit à ce cours.
        </p>
      )}

      {inscrits.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {inscrits.map((inscription) => (
            <LigneSuivi
              key={inscription.id}
              inscription={inscription}
              coursId={coursId}
              libelle={libelle}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Ce qui demande une confirmation.
 *
 * `regenerer` et `revoquer` cassent un lien déjà distribué — c'est le motif
 * habituel. `activer` n'est pas du même ordre, et c'est justement pourquoi il
 * en demande une aussi : **il publie le passé**. Tous les commentaires de
 * récitation déjà écrits — sous un régime où seuls l'enseignant et le
 * responsable les lisaient — deviennent lisibles d'un clic. Il n'existe ni
 * fenêtre de publication, ni « à partir de telle date » : le geste est global,
 * il doit être conscient.
 */
type Confirmation = 'activer' | 'regenerer' | 'revoquer'

const TEXTES_CONFIRMATION: Record<Confirmation, { titre: string; description: string }> = {
  activer: {
    titre: 'Ouvrir le suivi de cet apprenant ?',
    description:
      "La famille verra, dès l'ouverture du lien, TOUTES les notes de récitation déjà saisies et les commentaires qui les accompagnent — y compris ceux écrits avant aujourd'hui. Relisez-les si vous les aviez pris pour vous.",
  },
  regenerer: {
    titre: 'Régénérer ce lien de suivi ?',
    description:
      "L'ancien lien cessera immédiatement de fonctionner. La famille devra recevoir le nouveau.",
  },
  revoquer: {
    titre: 'Fermer ce suivi ?',
    description:
      'Le lien cessera immédiatement de fonctionner. Vous pourrez rouvrir un suivi plus tard, mais un nouveau lien sera généré.',
  },
}

function LigneSuivi({
  inscription,
  coursId,
  libelle,
}: {
  inscription: InscriptionAvecApprenant
  coursId: string
  libelle: string
}) {
  const activer = useActiverSuivi()
  const regenerer = useRegenererSuivi()
  const revoquer = useRevoquerSuivi()

  const [copie, setCopie] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)

  const cible: CibleSuivi = {
    inscriptionId: inscription.id,
    apprenantId: inscription.apprenant_id,
    coursId,
  }

  const nomComplet =
    [inscription.apprenant?.prenom, inscription.apprenant?.nom].filter(Boolean).join(' ') ||
    'cet apprenant'

  const enCours = activer.isPending || regenerer.isPending || revoquer.isPending
  const erreur = activer.error ?? regenerer.error ?? revoquer.error

  const url = inscription.jeton ? urlSuivi(window.location.origin, inscription.jeton) : null

  async function copier() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopie(true)
    window.setTimeout(() => setCopie(false), 2000)
  }

  function confirmer() {
    if (confirmation === 'activer') activer.mutate(cible)
    if (confirmation === 'regenerer') regenerer.mutate(cible)
    if (confirmation === 'revoquer') revoquer.mutate(cible)
    setConfirmation(null)
  }

  return (
    <li className="space-y-2 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-32 flex-1 truncate text-sm font-medium">{nomComplet}</span>

        {!url && (
          <Button size="sm" onClick={() => setConfirmation('activer')} disabled={enCours}>
            {activer.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Ouvrir le suivi
          </Button>
        )}
      </div>

      {erreur && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertDescription>{erreur.message}</AlertDescription>
        </Alert>
      )}

      {url && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={url}
              aria-label={`Lien de suivi de ${nomComplet}`}
              onFocus={(evenement) => evenement.currentTarget.select()}
              className="h-9 font-mono text-xs"
            />
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => void copier()}
              aria-label={copie ? 'Lien copié' : `Copier le lien de ${nomComplet}`}
              title={copie ? 'Lien copié' : 'Copier le lien'}
            >
              {copie ? (
                <Check className="size-4 text-primary" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a
                href={lienWhatsAppSuivi(url, nomComplet, libelle)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="size-4" aria-hidden="true" />
                WhatsApp
              </a>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmation('regenerer')}
              disabled={enCours}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Régénérer
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmation('revoquer')}
              disabled={enCours}
            >
              <Link2Off className="size-4 text-destructive" aria-hidden="true" />
              Fermer
            </Button>
          </div>
        </div>
      )}

      <AlertDialog
        open={Boolean(confirmation)}
        onOpenChange={(ouvert) => {
          if (!ouvert) setConfirmation(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmation ? TEXTES_CONFIRMATION[confirmation].titre : ''}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation ? TEXTES_CONFIRMATION[confirmation].description : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(evenement) => {
                evenement.preventDefault()
                confirmer()
              }}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}
