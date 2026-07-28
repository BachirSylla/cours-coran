import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, TriangleAlert } from 'lucide-react'

import { useEnregistrerPaiement } from '@/features/paiements/hooks/useEnregistrerPaiement'
import {
  METHODES_COURANTES,
  paiementSchema,
  valeursParDefaut,
  type PaiementFormValues,
  type PaiementValues,
} from '@/features/paiements/paiementSchema'
import { formaterMontant, libelleMois } from '@/shared/lib/paiements'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'

/** Ce qu'il faut connaître du mois pour enregistrer un règlement. */
export interface CibleReglement {
  cours_id: string
  cours_libelle: string
  mois: string
  montant_du: number
  montant_recu: number
  devise: string
}

export interface PaiementFormDialogProps {
  cible: CibleReglement | null
  onOuvertChange: (ouvert: boolean) => void
}

function Contenu({ cible, onFerme }: { cible: CibleReglement; onFerme: () => void }) {
  const enregistrer = useEnregistrerPaiement()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PaiementFormValues, unknown, PaiementValues>({
    resolver: zodResolver(paiementSchema),
    defaultValues: valeursParDefaut(cible.montant_du, cible.montant_recu),
  })

  async function onSubmit(valeurs: PaiementValues) {
    await enregistrer.mutateAsync({
      cours_id: cible.cours_id,
      mois_concerne: cible.mois,
      // Le montant dû est figé ici : un changement ultérieur de prix mensuel
      // ne réécrira pas ce mois.
      montant_du: cible.montant_du,
      ...valeurs,
    })
    onFerme()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Enregistrer un règlement</DialogTitle>
        <DialogDescription>
          {cible.cours_libelle} · {libelleMois(cible.mois)} · dû{' '}
          {formaterMontant(cible.montant_du, cible.devise)}
        </DialogDescription>
      </DialogHeader>

      <form
        id="formulaire-paiement"
        onSubmit={(evenement) => void handleSubmit(onSubmit)(evenement)}
        className="space-y-4"
        noValidate
      >
        {enregistrer.isError && (
          <Alert variant="destructive">
            <TriangleAlert className="size-4" aria-hidden="true" />
            <AlertDescription>{enregistrer.error.message}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="montant_recu">Montant reçu</Label>
          <Input
            id="montant_recu"
            inputMode="decimal"
            autoFocus
            aria-invalid={Boolean(errors.montant_recu)}
            {...register('montant_recu')}
          />
          <p className="text-xs text-muted-foreground">
            Laissez le montant dû pour un règlement complet, ou saisissez la somme réellement
            reçue.
          </p>
          {errors.montant_recu && (
            <p className="text-sm text-destructive">{errors.montant_recu.message}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="date_paiement">Date du règlement</Label>
            <Input
              id="date_paiement"
              type="date"
              aria-invalid={Boolean(errors.date_paiement)}
              {...register('date_paiement')}
            />
            {errors.date_paiement && (
              <p className="text-sm text-destructive">{errors.date_paiement.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="methode">Méthode</Label>
            <Input
              id="methode"
              list="methodes-paiement"
              placeholder="Espèces, virement…"
              aria-invalid={Boolean(errors.methode)}
              {...register('methode')}
            />
            <datalist id="methodes-paiement">
              {METHODES_COURANTES.map((methode) => (
                <option key={methode} value={methode} />
              ))}
            </datalist>
            {errors.methode && (
              <p className="text-sm text-destructive">{errors.methode.message}</p>
            )}
          </div>
        </div>
      </form>

      <DialogFooter>
        <Button variant="outline" onClick={onFerme} disabled={enregistrer.isPending}>
          Annuler
        </Button>
        <Button type="submit" form="formulaire-paiement" disabled={enregistrer.isPending}>
          {enregistrer.isPending && (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          )}
          Enregistrer
        </Button>
      </DialogFooter>
    </>
  )
}

export function PaiementFormDialog({ cible, onOuvertChange }: PaiementFormDialogProps) {
  return (
    <Dialog open={Boolean(cible)} onOpenChange={onOuvertChange}>
      <DialogContent className="sm:max-w-md">
        {/* La `key` réinitialise le formulaire à chaque mois ouvert. */}
        {cible && (
          <Contenu
            key={`${cible.cours_id}-${cible.mois}`}
            cible={cible}
            onFerme={() => onOuvertChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
