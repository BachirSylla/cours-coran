import { useState } from 'react'
import { Loader2, TriangleAlert, Wallet } from 'lucide-react'

import {
  PaiementFormDialog,
  type CibleReglement,
} from '@/features/paiements/components/PaiementFormDialog'
import { StatutPaiementBadge } from '@/features/paiements/components/StatutPaiementBadge'
import { usePaiementsCours } from '@/features/paiements/hooks/usePaiementsCours'
import {
  formaterMontant,
  fusionnerPaiements,
  genererMoisDus,
  libelleMois,
  moisCourant,
} from '@/shared/lib/paiements'
import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'

export interface SectionPaiementsProps {
  cours: CoursAvecDetails
  /** Nombre de mois affichés. */
  limite?: number
}

/**
 * Derniers mois d'un cours et leur statut. Les règlements restent visibles quel
 * que soit le statut du cours — on n'efface pas une recette.
 */
export function SectionPaiements({ cours, limite = 6 }: SectionPaiementsProps) {
  const { data: paiements, isPending, isError, error } = usePaiementsCours(cours.id)
  const [cible, setCible] = useState<CibleReglement | null>(null)

  const courant = moisCourant()

  const dus = genererMoisDus(
    {
      id: cours.id,
      prix_mensuel: cours.prix_mensuel,
      date_debut: cours.date_debut,
      date_fin: cours.date_fin,
    },
    courant
  )

  // Du plus récent au plus ancien, limité aux derniers mois.
  const lignes = fusionnerPaiements(dus, paiements ?? [], courant)
    .slice()
    .reverse()
    .slice(0, limite)

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Wallet className="size-4 text-muted-foreground" aria-hidden="true" />
        Paiements
      </h3>

      {isPending && (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Chargement des paiements…
        </p>
      )}

      {isError && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {!isPending && !isError && lignes.length === 0 && (
        <p className="rounded-lg border border-dashed px-4 py-4 text-center text-sm text-muted-foreground">
          {cours.prix_mensuel === null
            ? 'Aucun prix mensuel renseigné pour ce cours.'
            : 'Aucun mois à facturer pour le moment.'}
        </p>
      )}

      {lignes.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {lignes.map((ligne) => (
            <li key={ligne.mois} className="flex items-center gap-3 px-3 py-2">
              <span className="w-32 shrink-0 text-sm capitalize">
                {libelleMois(ligne.mois)}
              </span>
              <span className="min-w-0 flex-1 text-xs text-muted-foreground tabular-nums">
                {formaterMontant(ligne.montant_recu, cours.devise)} /{' '}
                {formaterMontant(ligne.montant_du, cours.devise)}
              </span>
              <StatutPaiementBadge statut={ligne.statut} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setCible({
                    cours_id: cours.id,
                    cours_libelle: cours.libelle,
                    mois: ligne.mois,
                    montant_du: ligne.montant_du,
                    montant_recu: ligne.montant_recu,
                    devise: cours.devise,
                  })
                }
                aria-label={`Enregistrer un règlement pour ${libelleMois(ligne.mois)}`}
              >
                Saisir
              </Button>
            </li>
          ))}
        </ul>
      )}

      <PaiementFormDialog
        cible={cible}
        onOuvertChange={(ouvert) => {
          if (!ouvert) setCible(null)
        }}
      />
    </section>
  )
}
