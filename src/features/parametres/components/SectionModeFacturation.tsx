import { useState } from 'react'
import { Loader2, TriangleAlert, Wallet } from 'lucide-react'

import { useEnregistrerModeFacturation } from '@/features/parametres/hooks/useEnregistrerModeFacturation'
import { useSessions } from '@/features/sessions/hooks/useSessions'
import {
  LIBELLES_MODE_FACTURATION,
  MODES_FACTURATION,
  type ModeFacturation,
} from '@/shared/lib/facturation'
import type { ParametresEffectifs } from '@/shared/supabase/parametresRepo'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Label } from '@/shared/ui/label'
import { SelectNatif } from '@/shared/ui/SelectNatif'

export interface SectionModeFacturationProps {
  parametres: ParametresEffectifs
}

const EXPLICATIONS: Record<ModeFacturation, string> = {
  mensuel:
    'Chaque apprenant règle un montant par mois, pour chacun de ses cours. Un mois entamé est un mois dû — il n’y a pas de prorata.',
  par_session:
    'Chaque apprenant règle un forfait unique couvrant toute la session, pour chacun de ses cours. Rejoindre en cours de session ne donne pas de remise.',
}

/**
 * Le rythme de facturation du centre (migration 0026).
 *
 * Uniforme à tout le centre : le choix vaut pour tous les cours. L'affiner cours
 * par cours demanderait une décision délibérée, pas un réglage de plus.
 *
 * ⚠️ Changer de mode ne touche **aucun** règlement déjà saisi. C'est dit à
 * l'écran, parce que c'est exactement la crainte qu'un tel réglage inspire — et
 * qu'une crainte non levée fait renoncer à essayer.
 */
export function SectionModeFacturation({ parametres }: SectionModeFacturationProps) {
  const enregistrer = useEnregistrerModeFacturation()
  const { data: sessions } = useSessions()

  const [mode, setMode] = useState<ModeFacturation>(parametres.mode_facturation)
  const modifie = mode !== parametres.mode_facturation

  /*
   * Un forfait suppose une période qui se termine : la base refuse d'en
   * enregistrer un sur une session sans date de fin (P0080). On ne bloque pas la
   * bascule pour autant — mettre en ordre AVANT de pouvoir seulement essayer le
   * mode serait un ordre absurde — mais on dit lesquelles sont concernées.
   */
  const perpetuelles = (sessions ?? []).filter(
    (session) => session.date_fin === null && session.statut !== 'terminee'
  )

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Wallet className="size-4 text-muted-foreground" aria-hidden="true" />
          Rythme de facturation
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Il s'applique à tous les cours du centre.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mode-facturation">Mode</Label>
        <SelectNatif
          id="mode-facturation"
          value={mode}
          onChange={(evenement) => setMode(evenement.currentTarget.value as ModeFacturation)}
          className="sm:max-w-xs"
        >
          {MODES_FACTURATION.map((valeur) => (
            <option key={valeur} value={valeur}>
              {LIBELLES_MODE_FACTURATION[valeur]}
            </option>
          ))}
        </SelectNatif>
        <p className="text-xs text-muted-foreground">{EXPLICATIONS[mode]}</p>
      </div>

      {mode === 'par_session' && perpetuelles.length > 0 && (
        <Alert>
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertDescription>
            {perpetuelles.length === 1
              ? `« ${perpetuelles[0]!.nom} » n'a pas de date de fin : un forfait suppose une période qui se termine. Donnez-lui une date de fin avant d'y enregistrer des règlements.`
              : `${perpetuelles.length} sessions n'ont pas de date de fin : un forfait suppose une période qui se termine. Donnez-leur une date de fin avant d'y enregistrer des règlements.`}
          </AlertDescription>
        </Alert>
      )}

      {modifie && (
        <Alert>
          <AlertDescription>
            Les règlements déjà enregistrés sont <strong>conservés</strong> et restent
            modifiables. Changer de mode ne détruit rien : seuls les nouveaux règlements
            suivront le nouveau rythme. Le tarif de l'autre mode est conservé lui aussi.
          </AlertDescription>
        </Alert>
      )}

      {enregistrer.isError && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertDescription>{enregistrer.error.message}</AlertDescription>
        </Alert>
      )}

      <Button
        onClick={() => enregistrer.mutate(mode)}
        disabled={!modifie || enregistrer.isPending}
      >
        {enregistrer.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        Enregistrer le mode
      </Button>
    </section>
  )
}
