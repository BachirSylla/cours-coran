import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, TriangleAlert } from 'lucide-react'

import { useEnregistrerReglement } from '@/features/paiements/hooks/useReglements'
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

/**
 * Ce qu'il faut connaître pour enregistrer le règlement d'une personne.
 *
 * La période prend l'une OU l'autre forme, comme en base : un mois, ou une
 * session. Les deux champs sont portés ensemble plutôt que réunis en une chaîne,
 * pour que le repository n'ait rien à ré-interpréter.
 */
export interface CibleReglementNominatif {
  inscription_id: string
  apprenant: string
  cours_libelle: string
  mois: string | null
  session_id: string | null
  /** Nom de la session, quand la période en est une. */
  session_nom: string | null
  montant_du: number
  montant_recu: number
  devise: string
}

export interface ReglementFormDialogProps {
  cible: CibleReglementNominatif | null
  onOuvertChange: (ouvert: boolean) => void
}

function Contenu({
  cible,
  onFerme,
}: {
  cible: CibleReglementNominatif
  onFerme: () => void
}) {
  const enregistrer = useEnregistrerReglement()

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
      inscription_id: cible.inscription_id,
      mois: cible.mois,
      session_id: cible.session_id,
      // Le montant dû est FIGÉ ici : un changement ultérieur de tarif ne
      // réécrira pas cette période. C'est la même règle que pour les mois.
      montant_du: cible.montant_du,
      montant_recu: valeurs.montant_recu,
      date_paiement: valeurs.date_paiement,
      methode: valeurs.methode,
    })
    onFerme()
  }

  const periode =
    cible.mois !== null ? libelleMois(cible.mois) : (cible.session_nom ?? 'la session')

  return (
    <>
      <DialogHeader>
        <DialogTitle>Enregistrer un règlement</DialogTitle>
        <DialogDescription>
          {cible.apprenant} · {cible.cours_libelle} · {periode} · dû{' '}
          {formaterMontant(cible.montant_du, cible.devise)}
        </DialogDescription>
      </DialogHeader>

      <form
        id="formulaire-reglement"
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
              list="methodes-reglement"
              placeholder="Espèces, virement…"
              aria-invalid={Boolean(errors.methode)}
              {...register('methode')}
            />
            <datalist id="methodes-reglement">
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
        <Button type="submit" form="formulaire-reglement" disabled={enregistrer.isPending}>
          {enregistrer.isPending && (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          )}
          Enregistrer
        </Button>
      </DialogFooter>
    </>
  )
}

export function ReglementFormDialog({ cible, onOuvertChange }: ReglementFormDialogProps) {
  return (
    <Dialog open={Boolean(cible)} onOpenChange={onOuvertChange}>
      <DialogContent className="sm:max-w-md">
        {/* La `key` réinitialise le formulaire à chaque période ouverte. */}
        {cible && (
          <Contenu
            key={`${cible.inscription_id}-${cible.mois ?? cible.session_id}`}
            cible={cible}
            onFerme={() => onOuvertChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
