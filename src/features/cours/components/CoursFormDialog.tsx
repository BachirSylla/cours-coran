import { useEffect, useMemo } from 'react'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, TriangleAlert } from 'lucide-react'

import { CreneauxFieldArray } from '@/features/cours/components/CreneauxFieldArray'
import {
  detecterConflitsFormulaire,
  indexEnConflit as calculerIndexEnConflit,
  messageConflit,
  type CreneauExistant,
} from '@/features/cours/conflitsCours'
import {
  coursSchema,
  FORMATS_COURS,
  LIBELLES_FORMAT,
  LIBELLES_STATUT_COURS,
  STATUTS_COURS,
  valeursParDefaut,
  type CoursFormValues,
  type CoursValues,
} from '@/features/cours/coursSchema'
import {
  messageFormatIncompatible,
  peutPasserEnIndividuel,
} from '@/features/inscriptions/reglesInscription'
import type { TypeCours } from '@/shared/supabase/typeCoursRepo'
import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert'
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

export interface CoursFormDialogProps {
  ouvert: boolean
  onOuvertChange: (ouvert: boolean) => void
  /** Cours à modifier ; absent ou `null` = création. */
  cours?: CoursAvecDetails | null
  typesCours: TypeCours[]
  /** Tous les créneaux déjà enregistrés, pour la détection de conflit. */
  creneauxExistants: CreneauExistant[]
  onEnregistrer: (valeurs: CoursValues) => Promise<void>
  enCours: boolean
  erreur?: string | null
  /** Inscrits du cours édité : borne le passage au format individuel (§5.7). */
  nbInscrits?: number
}

function versFormulaire(cours: CoursAvecDetails): CoursFormValues {
  return {
    libelle: cours.libelle,
    type_cours_id: cours.type_cours_id,
    format: (cours.format === 'groupe' ? 'groupe' : 'individuel') as CoursFormValues['format'],
    date_debut: cours.date_debut,
    date_fin: cours.date_fin ?? '',
    lien_meet: cours.lien_meet ?? '',
    prix_mensuel: cours.prix_mensuel === null ? '' : String(cours.prix_mensuel),
    devise: cours.devise,
    statut: (STATUTS_COURS.find((s) => s === cours.statut) ??
      'actif') as CoursFormValues['statut'],
    creneaux: cours.creneau.map((creneau) => ({
      jour_semaine: String(creneau.jour_semaine),
      heure_debut: creneau.heure_debut.slice(0, 5),
      heure_fin: creneau.heure_fin.slice(0, 5),
    })),
  }
}

export function CoursFormDialog({
  ouvert,
  onOuvertChange,
  cours,
  typesCours,
  creneauxExistants,
  onEnregistrer,
  enCours,
  erreur,
  nbInscrits = 0,
}: CoursFormDialogProps) {
  const modeEdition = Boolean(cours)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<CoursFormValues, unknown, CoursValues>({
    resolver: zodResolver(coursSchema),
    defaultValues: valeursParDefaut(),
  })

  const champsCreneaux = useFieldArray({ control, name: 'creneaux' })

  useEffect(() => {
    if (ouvert) {
      reset(cours ? versFormulaire(cours) : valeursParDefaut())
    }
  }, [ouvert, cours, reset])

  // Recalcul à chaque frappe : le conflit se voit avant même de soumettre.
  // `useWatch` s'abonne proprement au champ, contrairement à `watch()` qui
  // renvoie une valeur dont React ne suit pas les changements.
  const creneauxSaisis = useWatch({ control, name: 'creneaux' })

  const conflits = useMemo(
    () => detecterConflitsFormulaire(creneauxSaisis ?? [], creneauxExistants, cours?.id),
    [creneauxSaisis, creneauxExistants, cours?.id]
  )

  const lignesEnConflit = useMemo(() => calculerIndexEnConflit(conflits), [conflits])

  // Messages dédoublonnés : deux créneaux peuvent heurter le même cours.
  const messages = useMemo(() => [...new Set(conflits.map(messageConflit))], [conflits])

  // Passer en individuel créerait l'état que la règle §5.7 interdit : un cours
  // individuel à plusieurs inscrits.
  const format = useWatch({ control, name: 'format' })
  const formatIncompatible = format === 'individuel' && !peutPasserEnIndividuel(nbInscrits)

  return (
    <Dialog open={ouvert} onOpenChange={onOuvertChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{modeEdition ? 'Modifier le cours' : 'Nouveau cours'}</DialogTitle>
          <DialogDescription>
            Un cours occupe un ou plusieurs créneaux hebdomadaires. Deux cours ne peuvent jamais
            se chevaucher.
          </DialogDescription>
        </DialogHeader>

        <form
          id="formulaire-cours"
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

          {formatIncompatible && (
            <Alert variant="destructive">
              <TriangleAlert className="size-4" aria-hidden="true" />
              <AlertTitle>Format incompatible</AlertTitle>
              <AlertDescription>{messageFormatIncompatible(nbInscrits)}</AlertDescription>
            </Alert>
          )}

          {messages.length > 0 && (
            <Alert variant="destructive">
              <TriangleAlert className="size-4" aria-hidden="true" />
              <AlertTitle>
                {messages.length === 1
                  ? 'Conflit de créneau'
                  : `${messages.length} conflits de créneau`}
              </AlertTitle>
              <AlertDescription>
                <ul className="list-inside list-disc">
                  {messages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="libelle">Libellé</Label>
            <Input
              id="libelle"
              autoFocus
              placeholder="Groupe Hifz du samedi"
              aria-invalid={Boolean(errors.libelle)}
              {...register('libelle')}
            />
            {errors.libelle && (
              <p className="text-sm text-destructive">{errors.libelle.message}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="type_cours_id">Type de cours</Label>
              <Controller
                control={control}
                name="type_cours_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="type_cours_id" className="w-full">
                      <SelectValue placeholder="Choisir un type…" />
                    </SelectTrigger>
                    <SelectContent>
                      {typesCours.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.libelle}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.type_cours_id && (
                <p className="text-sm text-destructive">{errors.type_cours_id.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="format">Format</Label>
              <Controller
                control={control}
                name="format"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="format" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORMATS_COURS.map((format) => (
                        <SelectItem key={format} value={format}>
                          {LIBELLES_FORMAT[format]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <CreneauxFieldArray
            control={control}
            champs={champsCreneaux}
            register={register}
            errors={errors}
            indexEnConflit={lignesEnConflit}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="date_debut">Date de début</Label>
              <Input
                id="date_debut"
                type="date"
                aria-invalid={Boolean(errors.date_debut)}
                {...register('date_debut')}
              />
              {errors.date_debut && (
                <p className="text-sm text-destructive">{errors.date_debut.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="date_fin">Date de fin</Label>
              <Input
                id="date_fin"
                type="date"
                aria-invalid={Boolean(errors.date_fin)}
                {...register('date_fin')}
              />
              <p className="text-xs text-muted-foreground">Vide tant que le cours continue.</p>
              {errors.date_fin && (
                <p className="text-sm text-destructive">{errors.date_fin.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lien_meet">Lien de visioconférence</Label>
            <Input
              id="lien_meet"
              type="url"
              placeholder="https://meet.google.com/…"
              aria-invalid={Boolean(errors.lien_meet)}
              {...register('lien_meet')}
            />
            <p className="text-xs text-muted-foreground">
              Un seul lien pour tout le cours, réutilisé par toutes ses séances.
            </p>
            {errors.lien_meet && (
              <p className="text-sm text-destructive">{errors.lien_meet.message}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="prix_mensuel">Prix mensuel</Label>
              <Input
                id="prix_mensuel"
                inputMode="decimal"
                placeholder="0"
                aria-invalid={Boolean(errors.prix_mensuel)}
                {...register('prix_mensuel')}
              />
              {errors.prix_mensuel && (
                <p className="text-sm text-destructive">{errors.prix_mensuel.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="devise">Devise</Label>
              <Input
                id="devise"
                maxLength={3}
                aria-invalid={Boolean(errors.devise)}
                {...register('devise')}
              />
              {errors.devise && (
                <p className="text-sm text-destructive">{errors.devise.message}</p>
              )}
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
                      {STATUTS_COURS.map((statut) => (
                        <SelectItem key={statut} value={statut}>
                          {LIBELLES_STATUT_COURS[statut]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOuvertChange(false)} disabled={enCours}>
            Annuler
          </Button>
          <Button
            type="submit"
            form="formulaire-cours"
            disabled={enCours || messages.length > 0 || formatIncompatible}
            title={
              messages.length > 0
                ? 'Résolvez les conflits de créneau avant d’enregistrer'
                : formatIncompatible
                  ? 'Retirez des apprenants avant de passer ce cours en individuel'
                  : undefined
            }
          >
            {enCours && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {modeEdition ? 'Enregistrer' : 'Créer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
