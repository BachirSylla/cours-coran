import { useState } from 'react'
import { Link } from 'react-router'
import { Loader2, TriangleAlert, Wallet } from 'lucide-react'

import { LignesPaiements } from '@/features/paiements/components/LignesPaiements'
import { NavigateurMois } from '@/features/paiements/components/NavigateurMois'
import {
  PaiementFormDialog,
  type CibleReglement,
} from '@/features/paiements/components/PaiementFormDialog'
import { TotauxMois } from '@/features/paiements/components/TotauxMois'
import { usePaiementsMois } from '@/features/paiements/hooks/usePaiementsMois'
import type { LigneMois } from '@/features/paiements/hooks/usePaiementsMois'
import { moisCourant, moisPrecedent, moisSuivant } from '@/shared/lib/paiements'
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'

export function PaiementsPage() {
  const [mois, setMois] = useState(moisCourant)
  const [cible, setCible] = useState<CibleReglement | null>(null)

  const { lignes, totaux, isPending, isError, error } = usePaiementsMois(mois)

  // Toutes les lignes d'un mois partagent en pratique la même devise ; on prend
  // celle de la première plutôt que d'inventer un total multi-devises.
  const devise = lignes[0]?.devise ?? 'XOF'

  function ouvrirReglement(ligne: LigneMois) {
    setCible({
      cours_id: ligne.cours_id,
      cours_libelle: ligne.cours_libelle,
      mois: ligne.mois,
      montant_du: ligne.montant_du,
      montant_recu: ligne.montant_recu,
      devise: ligne.devise,
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Paiements</h1>
          <p className="text-sm text-muted-foreground">
            Suivi mensuel des règlements, à titre indicatif.
          </p>
        </div>

        <NavigateurMois
          mois={mois}
          onPrecedent={() => setMois(moisPrecedent(mois))}
          onSuivant={() => setMois(moisSuivant(mois))}
          onMoisCourant={() => setMois(moisCourant())}
          estMoisCourant={mois === moisCourant()}
        />
      </div>

      {isPending && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Chargement des paiements…
        </div>
      )}

      {isError && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertTitle>Chargement impossible</AlertTitle>
          <AlertDescription>{error?.message}</AlertDescription>
        </Alert>
      )}

      {!isPending && !isError && lignes.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Wallet className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-medium">Rien à facturer ce mois-ci</p>
            <p className="text-sm text-muted-foreground">
              Seuls les cours actifs ayant un prix mensuel apparaissent ici.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/cours">Voir mes cours</Link>
          </Button>
        </div>
      )}

      {!isPending && !isError && lignes.length > 0 && (
        <div className="space-y-4">
          <TotauxMois du={totaux.du} recu={totaux.recu} reste={totaux.reste} devise={devise} />
          <LignesPaiements lignes={lignes} onEnregistrer={ouvrirReglement} />
        </div>
      )}

      <PaiementFormDialog
        cible={cible}
        onOuvertChange={(ouvert) => {
          if (!ouvert) setCible(null)
        }}
      />
    </div>
  )
}
