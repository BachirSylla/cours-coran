import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, TriangleAlert } from 'lucide-react'

import {
  apprenantSchema,
  LIBELLES_STATUT,
  STATUTS_APPRENANT,
  valeursParDefaut,
  type ApprenantFormValues,
  type ApprenantValues,
} from '@/features/apprenants/apprenantSchema'
import type { Apprenant } from '@/shared/supabase/apprenantRepo'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { Textarea } from '@/shared/ui/textarea'

export interface ApprenantFormDialogProps {
  ouvert: boolean
  onOuvertChange: (ouvert: boolean) => void
  /** Apprenant à modifier ; absent ou `null` = création. */
  apprenant?: Apprenant | null
  onEnregistrer: (valeurs: ApprenantValues) => Promise<void>
  enCours: boolean
  erreur?: string | null
}

/** Les colonnes nullables arrivent à `null` : le formulaire attend des chaînes. */
function versFormulaire(apprenant: Apprenant): ApprenantFormValues {
  return {
    nom: apprenant.nom,
    prenom: apprenant.prenom,
    contact: apprenant.contact ?? '',
    niveau: apprenant.niveau ?? '',
    notes: apprenant.notes ?? '',
    statut: (apprenant.statut === 'pause' || apprenant.statut === 'parti'
      ? apprenant.statut
      : 'actif') satisfies ApprenantFormValues['statut'],
    date_inscription: apprenant.date_inscription,
  }
}

export function ApprenantFormDialog({
  ouvert,
  onOuvertChange,
  apprenant,
  onEnregistrer,
  enCours,
  erreur,
}: ApprenantFormDialogProps) {
  const modeEdition = Boolean(apprenant)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<ApprenantFormValues, unknown, ApprenantValues>({
    resolver: zodResolver(apprenantSchema),
    defaultValues: valeursParDefaut(),
  })

  // Réinitialise à chaque ouverture : sinon le formulaire garderait les valeurs
  // de l'apprenant précédemment édité.
  useEffect(() => {
    if (ouvert) {
      reset(apprenant ? versFormulaire(apprenant) : valeursParDefaut())
    }
  }, [ouvert, apprenant, reset])

  return (
    <Dialog open={ouvert} onOpenChange={onOuvertChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{modeEdition ? "Modifier l'apprenant" : 'Nouvel apprenant'}</DialogTitle>
          <DialogDescription>
            {modeEdition
              ? 'Mettez à jour la fiche de cet apprenant.'
              : 'Renseignez les informations de l’apprenant. Seuls le nom et le prénom sont obligatoires.'}
          </DialogDescription>
        </DialogHeader>

        <form
          id="formulaire-apprenant"
          onSubmit={(evenement) => void handleSubmit(onEnregistrer)(evenement)}
          className="space-y-4"
          noValidate
        >
          {erreur && (
            <Alert variant="destructive">
              <TriangleAlert className="size-4" aria-hidden="true" />
              <AlertDescription>{erreur}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="prenom">Prénom</Label>
              <Input
                id="prenom"
                autoFocus
                aria-invalid={Boolean(errors.prenom)}
                {...register('prenom')}
              />
              {errors.prenom && (
                <p className="text-sm text-destructive">{errors.prenom.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="nom">Nom</Label>
              <Input id="nom" aria-invalid={Boolean(errors.nom)} {...register('nom')} />
              {errors.nom && <p className="text-sm text-destructive">{errors.nom.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact">Contact</Label>
            <Input
              id="contact"
              placeholder="WhatsApp, téléphone ou e-mail"
              aria-invalid={Boolean(errors.contact)}
              {...register('contact')}
            />
            {errors.contact && (
              <p className="text-sm text-destructive">{errors.contact.message}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="niveau">Niveau</Label>
              <Input
                id="niveau"
                placeholder="Débutant, Qaïda…"
                aria-invalid={Boolean(errors.niveau)}
                {...register('niveau')}
              />
              {errors.niveau && (
                <p className="text-sm text-destructive">{errors.niveau.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="date_inscription">Date d’inscription</Label>
              <Input
                id="date_inscription"
                type="date"
                aria-invalid={Boolean(errors.date_inscription)}
                {...register('date_inscription')}
              />
              {errors.date_inscription && (
                <p className="text-sm text-destructive">{errors.date_inscription.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="statut">Statut</Label>
            <Controller
              control={control}
              name="statut"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="statut" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUTS_APPRENANT.map((statut) => (
                      <SelectItem key={statut} value={statut}>
                        {LIBELLES_STATUT[statut]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={3}
              placeholder="Observations, disponibilités…"
              aria-invalid={Boolean(errors.notes)}
              {...register('notes')}
            />
            {errors.notes && <p className="text-sm text-destructive">{errors.notes.message}</p>}
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOuvertChange(false)} disabled={enCours}>
            Annuler
          </Button>
          <Button type="submit" form="formulaire-apprenant" disabled={enCours}>
            {enCours && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {modeEdition ? 'Enregistrer' : 'Créer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
