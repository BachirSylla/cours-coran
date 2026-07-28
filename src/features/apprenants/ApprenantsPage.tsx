import { useState } from 'react'
import { Loader2, Plus, TriangleAlert, Users } from 'lucide-react'

import { ApprenantDetailDialog } from '@/features/apprenants/components/ApprenantDetailDialog'
import { ApprenantFormDialog } from '@/features/apprenants/components/ApprenantFormDialog'
import { ApprenantsListe } from '@/features/apprenants/components/ApprenantsListe'
import { SupprimerApprenantDialog } from '@/features/apprenants/components/SupprimerApprenantDialog'
import type { ApprenantValues } from '@/features/apprenants/apprenantSchema'
import { useApprenants } from '@/features/apprenants/hooks/useApprenants'
import { useCreerApprenant } from '@/features/apprenants/hooks/useCreerApprenant'
import { useModifierApprenant } from '@/features/apprenants/hooks/useModifierApprenant'
import { useSupprimerApprenant } from '@/features/apprenants/hooks/useSupprimerApprenant'
import type { Apprenant } from '@/shared/supabase/apprenantRepo'
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'

export function ApprenantsPage() {
  const { data: apprenants, isPending, isError, error } = useApprenants()

  const creer = useCreerApprenant()
  const modifier = useModifierApprenant()
  const supprimer = useSupprimerApprenant()

  const [formulaireOuvert, setFormulaireOuvert] = useState(false)
  const [apprenantEdite, setApprenantEdite] = useState<Apprenant | null>(null)
  const [apprenantDetaille, setApprenantDetaille] = useState<Apprenant | null>(null)
  const [apprenantASupprimer, setApprenantASupprimer] = useState<Apprenant | null>(null)

  function ouvrirCreation() {
    setApprenantEdite(null)
    creer.reset()
    modifier.reset()
    setFormulaireOuvert(true)
  }

  function ouvrirEdition(apprenant: Apprenant) {
    setApprenantDetaille(null)
    setApprenantEdite(apprenant)
    creer.reset()
    modifier.reset()
    setFormulaireOuvert(true)
  }

  async function enregistrer(valeurs: ApprenantValues) {
    if (apprenantEdite) {
      await modifier.mutateAsync({ id: apprenantEdite.id, patch: valeurs })
    } else {
      await creer.mutateAsync(valeurs)
    }
    setFormulaireOuvert(false)
    setApprenantEdite(null)
  }

  function confirmerSuppression() {
    if (!apprenantASupprimer) return
    supprimer.mutate(apprenantASupprimer.id, {
      onSuccess: () => setApprenantASupprimer(null),
    })
  }

  const erreurFormulaire = apprenantEdite ? modifier.error?.message : creer.error?.message

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Apprenants</h1>
          <p className="text-sm text-muted-foreground">
            Les personnes inscrites à vos cours, en individuel ou en groupe.
          </p>
        </div>

        <Button onClick={ouvrirCreation}>
          <Plus className="size-4" aria-hidden="true" />
          Nouvel apprenant
        </Button>
      </div>

      {supprimer.isError && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertTitle>Suppression impossible</AlertTitle>
          <AlertDescription>{supprimer.error.message}</AlertDescription>
        </Alert>
      )}

      {isPending && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Chargement des apprenants…
        </div>
      )}

      {isError && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertTitle>Chargement impossible</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {!isPending && !isError && apprenants.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Users className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-medium">Aucun apprenant pour le moment</p>
            <p className="text-sm text-muted-foreground">
              Créez une première fiche pour pouvoir l’inscrire à un cours.
            </p>
          </div>
          <Button variant="outline" onClick={ouvrirCreation}>
            <Plus className="size-4" aria-hidden="true" />
            Nouvel apprenant
          </Button>
        </div>
      )}

      {!isPending && !isError && apprenants.length > 0 && (
        <ApprenantsListe
          apprenants={apprenants}
          onOuvrir={setApprenantDetaille}
          onModifier={ouvrirEdition}
          onSupprimer={setApprenantASupprimer}
        />
      )}

      <ApprenantDetailDialog
        apprenant={apprenantDetaille}
        onOuvertChange={(ouvert) => {
          if (!ouvert) setApprenantDetaille(null)
        }}
        onModifier={ouvrirEdition}
      />

      <ApprenantFormDialog
        ouvert={formulaireOuvert}
        onOuvertChange={setFormulaireOuvert}
        apprenant={apprenantEdite}
        onEnregistrer={enregistrer}
        enCours={creer.isPending || modifier.isPending}
        erreur={erreurFormulaire ?? null}
      />

      <SupprimerApprenantDialog
        apprenant={apprenantASupprimer}
        onOuvertChange={(ouvert) => {
          if (!ouvert) setApprenantASupprimer(null)
        }}
        onConfirmer={confirmerSuppression}
        enCours={supprimer.isPending}
      />
    </div>
  )
}
