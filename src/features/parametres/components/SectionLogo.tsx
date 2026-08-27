import { useRef, useState } from 'react'
import { ImagePlus, Loader2, Trash2, TriangleAlert } from 'lucide-react'

import { useEnregistrerLogo } from '@/features/parametres/hooks/useEnregistrerLogo'
import { redimensionnerLogo, TYPES_ACCEPTES } from '@/features/parametres/logo'
import type { ParametresEffectifs } from '@/shared/supabase/parametresRepo'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'

export interface SectionLogoProps {
  parametres: ParametresEffectifs
}

/**
 * Logo du centre, affiché en en-tête du rapport de session.
 *
 * L'aperçu reprend le gabarit exact du rapport — hauteur imposée, largeur
 * libre : ce qu'on voit ici est ce qui sera imprimé, y compris pour un logo
 * très large ou tout en hauteur.
 */
export function SectionLogo({ parametres }: SectionLogoProps) {
  const enregistrer = useEnregistrerLogo()
  const champ = useRef<HTMLInputElement>(null)
  const [refus, setRefus] = useState<string | null>(null)
  const [prepare, setPrepare] = useState(false)

  const logo = parametres.logo
  const enCours = prepare || enregistrer.isPending

  async function choisir(fichier: File | undefined) {
    setRefus(null)
    if (!fichier) return

    setPrepare(true)
    try {
      await enregistrer.mutateAsync(await redimensionnerLogo(fichier))
    } catch (erreur) {
      setRefus(erreur instanceof Error ? erreur.message : "Ce fichier n'a pas pu être utilisé.")
    } finally {
      setPrepare(false)
      // Sans cela, rechoisir le même fichier après un refus ne déclencherait
      // aucun événement : le champ garderait la même valeur.
      if (champ.current) champ.current.value = ''
    }
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4">
      <div>
        <h2 className="text-sm font-medium">Logo du centre</h2>
        <p className="text-sm text-muted-foreground">
          Affiché en en-tête du rapport de session. L'image est réduite et enregistrée dans
          votre compte — sans logo, l'en-tête reste tel quel.
        </p>
      </div>

      {logo && (
        <div className="flex w-fit items-center rounded-lg border bg-background p-3">
          <img
            src={logo}
            alt="Logo du centre"
            className="h-[46px] w-auto max-w-[150px] object-contain"
          />
        </div>
      )}

      <input
        ref={champ}
        type="file"
        accept={TYPES_ACCEPTES.join(',')}
        aria-label="Choisir un logo"
        className="hidden"
        onChange={(evenement) => void choisir(evenement.currentTarget.files?.[0])}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={enCours}
          onClick={() => champ.current?.click()}
        >
          {enCours ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <ImagePlus className="size-4" aria-hidden="true" />
          )}
          {logo ? 'Remplacer le logo' : 'Choisir un logo'}
        </Button>

        {logo && (
          <Button
            type="button"
            variant="ghost"
            disabled={enCours}
            onClick={() => enregistrer.mutate(null)}
          >
            <Trash2 className="size-4 text-destructive" aria-hidden="true" />
            Retirer
          </Button>
        )}
      </div>

      {refus && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertDescription>{refus}</AlertDescription>
        </Alert>
      )}

      {enregistrer.isError && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertDescription>{enregistrer.error.message}</AlertDescription>
        </Alert>
      )}
    </section>
  )
}
