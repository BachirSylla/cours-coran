import { useState } from 'react'
import {
  Check,
  Copy,
  Link2Off,
  Loader2,
  MessageCircle,
  RefreshCw,
  Share2,
  TriangleAlert,
} from 'lucide-react'

import {
  useActiverPartage,
  useDesactiverPartage,
  useRegenererPartage,
} from '@/features/partage/hooks/usePartage'
import { lienWhatsApp, urlPartage } from '@/features/partage/lienPartage'
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

export interface SectionPartageProps {
  coursId: string
  libelle: string
  /** `null` quand le partage n'a jamais été activé, ou qu'il a été révoqué. */
  jetonPartage: string | null
}

/** Confirmation demandée avant de casser un lien déjà distribué. */
type Confirmation = 'regenerer' | 'desactiver'

const TEXTES_CONFIRMATION: Record<Confirmation, { titre: string; description: string }> = {
  regenerer: {
    titre: 'Régénérer le lien de partage ?',
    description:
      "L'ancien lien cessera immédiatement de fonctionner. Les apprenants à qui vous l'avez envoyé devront recevoir le nouveau.",
  },
  desactiver: {
    titre: 'Désactiver le partage ?',
    description:
      'Le lien cessera immédiatement de fonctionner. Vous pourrez réactiver le partage plus tard, mais un nouveau lien sera généré.',
  },
}

/**
 * Partage public d'un cours, dans sa fiche.
 *
 * Le lien donne accès au lien de visioconférence sans aucun compte : les deux
 * actions destructrices passent donc par une confirmation, et ce qui devient
 * visible est énoncé — pas résumé en « certaines informations ».
 */
export function SectionPartage({ coursId, libelle, jetonPartage }: SectionPartageProps) {
  const activer = useActiverPartage()
  const regenerer = useRegenererPartage()
  const desactiver = useDesactiverPartage()

  const [copie, setCopie] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)

  const enCours = activer.isPending || regenerer.isPending || desactiver.isPending
  const erreur = activer.error ?? regenerer.error ?? desactiver.error

  const url = jetonPartage ? urlPartage(window.location.origin, jetonPartage) : null

  async function copier() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopie(true)
    window.setTimeout(() => setCopie(false), 2000)
  }

  function confirmer() {
    if (confirmation === 'regenerer') regenerer.mutate(coursId)
    if (confirmation === 'desactiver') desactiver.mutate(coursId)
    setConfirmation(null)
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Share2 className="size-4 text-muted-foreground" aria-hidden="true" />
          Partage
        </h3>

        {!jetonPartage && (
          <Button size="sm" onClick={() => activer.mutate(coursId)} disabled={enCours}>
            {activer.isPending && (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            )}
            Activer le partage
          </Button>
        )}
      </div>

      {erreur && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertDescription>{erreur.message}</AlertDescription>
        </Alert>
      )}

      {/* Dire précisément ce qui devient public : le libellé du cours et le
          dernier exercice sont du texte libre, écrit à l'origine pour soi. */}
      <p className="text-xs text-muted-foreground">
        {jetonPartage
          ? 'Ce lien donne accès au nom du cours, à ses horaires, au lien de visioconférence et au dernier exercice donné. Ni les apprenants, ni les notes, ni les paiements n’y figurent. Aucun compte n’est nécessaire pour l’ouvrir.'
          : 'Générez un lien à envoyer à vos apprenants : ils y verront l’horaire et le lien de visioconférence, sans avoir à créer de compte.'}
      </p>

      {url && (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={url}
              aria-label="Lien de partage du cours"
              onFocus={(evenement) => evenement.currentTarget.select()}
              className="h-9 font-mono text-xs"
            />
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => void copier()}
              aria-label={copie ? 'Lien copié' : 'Copier le lien'}
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
              <a href={lienWhatsApp(url, libelle)} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="size-4" aria-hidden="true" />
                Partager sur WhatsApp
              </a>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmation('regenerer')}
              disabled={enCours}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Régénérer le lien
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmation('desactiver')}
              disabled={enCours}
            >
              <Link2Off className="size-4 text-destructive" aria-hidden="true" />
              Désactiver le partage
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
    </section>
  )
}
