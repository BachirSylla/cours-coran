import { useState } from 'react'
import { Loader2, TriangleAlert, Video } from 'lucide-react'

import { useDefinirLienMeet } from '@/features/cours/hooks/useDefinirLienMeet'
import { LienMeet } from '@/features/cours/components/LienMeet'
import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'

export interface SectionVisioProps {
  cours: CoursAvecDetails
}

/**
 * Lien de visioconférence — **l'enseignant qui assure le cours** (0017).
 *
 * Il a quitté le formulaire de structure : un responsable qui n'enseigne pas le
 * cours n'a pas à décider où il se tient. Un seul lien pour tout le cours,
 * réutilisé par toutes ses séances (CLAUDE.md §5.4), et c'est aussi celui que
 * publie la page partagée aux apprenants.
 */
export function SectionVisio({ cours }: SectionVisioProps) {
  const enregistrer = useDefinirLienMeet()

  /*
   * On ne recopie PAS `cours.lien_meet` dans un état : `null` signifie « rien
   * saisi », et la valeur affichée retombe alors sur celle du serveur. Le champ
   * suit donc naturellement un rafraîchissement du cache ou un changement de
   * cours, sans effet de synchronisation — lequel serait à la fois superflu et
   * une source de désynchronisation silencieuse.
   */
  const [edite, setEdite] = useState<string | null>(null)
  const lien = edite ?? cours.lien_meet ?? ''

  const saisi = lien.trim()
  // `URL.canParse` accepte `javascript:` — et ce lien finit dans un `href`, y
  // compris sur la page publique. On exige http(s), comme la contrainte en base.
  const invalide = saisi !== '' && !/^https?:\/\//.test(saisi)
  const modifie = saisi !== (cours.lien_meet ?? '')

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Video className="size-4 text-muted-foreground" aria-hidden="true" />
        Visioconférence
      </h3>

      {cours.lien_meet && <LienMeet lien={cours.lien_meet} />}

      <div className="space-y-1.5">
        <Label htmlFor={`visio-${cours.id}`}>Lien du cours</Label>
        <Input
          id={`visio-${cours.id}`}
          inputMode="url"
          placeholder="https://meet.google.com/…"
          value={lien}
          aria-invalid={invalide}
          onChange={(evenement) => setEdite(evenement.currentTarget.value)}
        />
        {invalide && (
          <p className="text-sm text-destructive">
            Le lien doit être une URL valide (https://…).
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Videz le champ pour retirer le lien. Il apparaît aussi sur la page partagée aux
          apprenants.
        </p>
      </div>

      {enregistrer.isError && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertDescription>{enregistrer.error.message}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={invalide || !modifie || enregistrer.isPending}
          onClick={() =>
            enregistrer.mutate(
              { coursId: cours.id, lien: saisi === '' ? null : saisi },
              { onSuccess: () => setEdite(null) }
            )
          }
        >
          {enregistrer.isPending && (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          )}
          Enregistrer le lien
        </Button>

        {enregistrer.isSuccess && edite === null && (
          <span className="text-xs text-muted-foreground">Lien enregistré.</span>
        )}
      </div>
    </section>
  )
}
