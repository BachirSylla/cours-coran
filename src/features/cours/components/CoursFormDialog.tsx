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
import type { Membre } from '@/shared/supabase/membreRepo'
import type { TypeCours } from '@/shared/supabase/typeCoursRepo'
import { tarifDuCours, type CoursAvecDetails } from '@/shared/supabase/coursRepo'
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
  /**
   * Enseignant qui assurera ce cours **par défaut** : l'affecté en
   * modification, le créateur en création — c'est ce que pose
   * `enregistrer_cours`. Le sélecteur peut le changer ; le conflit se contrôle
   * alors contre l'agenda choisi (CLAUDE.md §5.1).
   */
  enseignantId: string | null
  /**
   * Membres du centre, cibles possibles de l'affectation (migration 0014). Le
   * sélecteur reste caché tant qu'il n'y a personne d'autre à qui confier le
   * cours : l'enseignant seul n'a pas à choisir entre lui-même et lui-même.
   */
  membres?: Membre[]
  /**
   * Session dans laquelle un NOUVEAU cours sera créé — la session active
   * (migration 0022). Un cours édité garde la sienne, quelle que soit celle-ci.
   */
  sessionId: string
  /**
   * Niveaux déjà employés dans le centre, proposés à la saisie. Ce ne sont que
   * des suggestions : le champ reste libre, et un niveau se crée en le tapant.
   */
  niveaux?: string[]
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
    // La session d'un cours édité est la SIENNE, jamais la session active : on
    // ne déplace pas un cours d'un onglet à l'autre par mégarde.
    session_id: cours.session_id,
    niveau: cours.niveau ?? '',
    format: (cours.format === 'groupe' ? 'groupe' : 'individuel') as CoursFormValues['format'],
    enseignant_id: cours.enseignant_id ?? '',
    date_debut: cours.date_debut,
    date_fin: cours.date_fin ?? '',
    prix_mensuel:
      tarifDuCours(cours)?.prix_mensuel == null
        ? ''
        : String(tarifDuCours(cours)?.prix_mensuel),
    devise: tarifDuCours(cours)?.devise ?? 'XOF',
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
  enseignantId,
  membres = [],
  sessionId,
  niveaux = [],
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
    // Le `reset` de l'effet d'ouverture pose les vraies valeurs ; celles-ci ne
    // servent qu'au premier rendu, avant que le dialogue ne s'ouvre.
    defaultValues: valeursParDefaut(sessionId),
  })

  const champsCreneaux = useFieldArray({ control, name: 'creneaux' })

  useEffect(() => {
    if (ouvert) {
      reset(
        cours
          ? versFormulaire(cours)
          : { ...valeursParDefaut(sessionId), enseignant_id: enseignantId ?? '' }
      )
    }
  }, [ouvert, cours, enseignantId, sessionId, reset])

  // Recalcul à chaque frappe : le conflit se voit avant même de soumettre.
  // `useWatch` s'abonne proprement au champ, contrairement à `watch()` qui
  // renvoie une valeur dont React ne suit pas les changements.
  const creneauxSaisis = useWatch({ control, name: 'creneaux' })

  // Changer d'enseignant re-scope l'aperçu de conflit sur-le-champ : c'est le
  // seul moyen de voir, avant d'enregistrer, que la personne visée est libre.
  const enseignantSaisi = useWatch({ control, name: 'enseignant_id' })
  const agenda = enseignantSaisi || enseignantId

  /*
   * Le conflit se compare à l'intérieur d'UNE session (0022). Celle du cours
   * édité, ou la session active en création — jamais les deux mélangées.
   */
  const sessionDuCours = cours?.session_id ?? sessionId

  const conflits = useMemo(
    () =>
      detecterConflitsFormulaire(creneauxSaisis ?? [], creneauxExistants, {
        sessionId: sessionDuCours,
        coursIdEdite: cours?.id,
        enseignantId: agenda,
      }),
    [creneauxSaisis, creneauxExistants, cours?.id, agenda, sessionDuCours]
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
            Un cours occupe un ou plusieurs créneaux hebdomadaires. Un même enseignant ne peut
            pas en tenir deux à la même heure.
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

            {membres.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="enseignant_id">Enseignant</Label>
                <Controller
                  control={control}
                  name="enseignant_id"
                  render={({ field }) => (
                    <Select value={field.value ?? ''} onValueChange={field.onChange}>
                      <SelectTrigger id="enseignant_id" className="w-full">
                        <SelectValue placeholder="Choisir un enseignant…" />
                      </SelectTrigger>
                      <SelectContent>
                        {membres.map((membre) => (
                          <SelectItem key={membre.user_id} value={membre.user_id}>
                            {membre.nom_affiche}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Les chevauchements sont contrôlés sur son agenda.
                </p>
                {errors.enseignant_id && (
                  <p className="text-sm text-destructive">{errors.enseignant_id.message}</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="niveau">Niveau</Label>
              <Input
                id="niveau"
                list="niveaux-du-centre"
                placeholder="Niveau 1, Débutant…"
                aria-invalid={Boolean(errors.niveau)}
                {...register('niveau')}
              />
              {/* Suggestions, jamais contrainte : un niveau se crée en le tapant.
                  `datalist` laisse le champ libre, là où un `select` obligerait
                  à passer par un écran d'administration pour un simple libellé. */}
              <datalist id="niveaux-du-centre">
                {niveaux.map((niveau) => (
                  <option key={niveau} value={niveau} />
                ))}
              </datalist>
              {errors.niveau && (
                <p className="text-sm text-destructive">{errors.niveau.message}</p>
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
