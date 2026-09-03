import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronDown, ClipboardCheck, Loader2, Lock, TriangleAlert } from 'lucide-react'

import { BlocPresenceIndisponible } from '@/features/seances/components/BlocPresenceIndisponible'
import { SectionPresence } from '@/features/seances/components/SectionPresence'
import { SelecteurSourate } from '@/features/seances/components/SelecteurSourate'
import { useEnregistrerSeance } from '@/features/seances/hooks/useEnregistrerSeance'
import { useSessionActive } from '@/features/sessions/hooks/useSessions'
import { useSeancesCours } from '@/features/seances/hooks/useSeancesCours'
import type { SeanceVueEnrichie } from '@/features/seances/regroupement'
import {
  LIBELLES_STATUT_SEANCE,
  LIBELLES_TYPE_TRAVAIL,
  refusSaisiePresence,
  seanceSchema,
  STATUTS_SEANCE,
  TYPES_TRAVAIL,
  typeCoursCoranique,
  valeursParDefaut,
  type SeanceFormValues,
  type SeanceValues,
} from '@/features/seances/seanceSchema'
import { libelleJour } from '@/features/cours/coursSchema'
import { cn } from '@/shared/lib/utils'
import { trouverParNom, trouverParNumero, type Sourate } from '@/shared/data/sourates'
import { exercicesAVerifier } from '@/shared/lib/progression'
import { normaliserHeure } from '@/shared/lib/seances'
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogClose,
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

export interface SeanceFormDialogProps {
  vue: SeanceVueEnrichie | null
  onOuvertChange: (ouvert: boolean) => void
}

function formaterDate(date: string): string {
  const [annee, mois, jour] = date.split('-')
  return annee && mois && jour ? `${jour}/${mois}/${annee}` : date
}

/**
 * Retrouve la sourate d'une séance : par son numéro s'il existe, sinon par le
 * texte — les séances saisies avant l'introduction du numéro n'ont que lui.
 */
function sourateDeLaSeance(seance: {
  sourate_numero: number | null
  sourate: string | null
}): Sourate | undefined {
  return trouverParNumero(seance.sourate_numero) ?? trouverParNom(seance.sourate)
}

function versFormulaire(vue: SeanceVueEnrichie): SeanceFormValues {
  const seance = vue.seance
  if (!seance) return valeursParDefaut()

  const sourate = sourateDeLaSeance(seance)

  return {
    statut: (STATUTS_SEANCE.find((s) => s === seance.statut) ??
      'faite') as SeanceFormValues['statut'],
    contenu_aborde: seance.contenu_aborde ?? '',
    sourate_numero: sourate ? String(sourate.numero) : '',
    sourate: sourate?.nom ?? seance.sourate ?? '',
    versets_de: seance.versets_de === null ? '' : String(seance.versets_de),
    versets_a: seance.versets_a === null ? '' : String(seance.versets_a),
    type_travail: (TYPES_TRAVAIL.find((t) => t === seance.type_travail) ??
      '') as SeanceFormValues['type_travail'],
    exercices_a_faire: seance.exercices_a_faire ?? '',
    observations: seance.observations ?? '',
    motif: seance.motif ?? '',
  }
}

/**
 * Le contenu vit dans un composant à part, monté avec une `key` propre à la
 * séance : tout son état (formulaire, bloc déplié, identifiant créé) s'initialise
 * au montage à partir de `vue`. Aucun effet de synchronisation n'est nécessaire.
 */
function ContenuSeance({ vue }: { vue: SeanceVueEnrichie }) {
  const enregistrer = useEnregistrerSeance()
  const { sessions } = useSessionActive()

  // Chaînage donné → vérifié (CLAUDE.md §6) : ce qui avait été demandé la fois
  // d'avant, pour le contrôler avant de saisir la séance du jour.
  const { data: seancesDuCours } = useSeancesCours(vue.cours_id)
  const aVerifier = exercicesAVerifier(seancesDuCours ?? [], vue.date)

  // Apparaît dès le premier enregistrement : c'est lui qui débloque la section
  // Présence, sans refermer le dialog.
  const [seanceCreeeId, setSeanceCreeeId] = useState<string | undefined>(undefined)
  const seanceId = vue.seance?.id ?? seanceCreeeId

  // Texte saisi avant l'existence du numéro et non rapproché d'une sourate
  // connue : on l'affiche plutôt que de le faire disparaître en silence.
  const texteSourateOrphelin =
    vue.seance && !sourateDeLaSeance(vue.seance) ? vue.seance.sourate : null

  const [detailsOuverts, setDetailsOuverts] = useState(
    () =>
      typeCoursCoranique(vue.type_libelle) ||
      Boolean(vue.seance?.sourate ?? vue.seance?.versets_de ?? vue.seance?.type_travail)
  )

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<SeanceFormValues, unknown, SeanceValues>({
    resolver: zodResolver(seanceSchema),
    defaultValues: versFormulaire(vue),
  })

  /*
   * Le statut tel qu'il est SAISI, et non tel qu'il est enregistré : l'écran doit
   * suivre le choix de l'enseignant au moment où il le fait, sans attendre un
   * aller-retour serveur. C'est aussi ce qui évite de lui tendre un formulaire
   * de présence que la base refusera (migration 0020).
   */
  const statutSaisi = useWatch({ control, name: 'statut' }) ?? 'faite'
  const refusPresence = refusSaisiePresence(statutSaisi, vue.date, new Date())

  /*
   * Une session clôturée n'accepte plus ni séance, ni présence, ni note
   * (migration 0023). La base le refuse par trigger ; l'écran ne fait que ne
   * pas tendre un formulaire qui échouerait — et dit pourquoi, plutôt que de
   * disparaître.
   */
  const session = sessions.find((candidate) => candidate.id === vue.session_id) ?? null
  const sessionClose = session?.statut === 'terminee'

  async function onSubmit(valeurs: SeanceValues) {
    const seance = await enregistrer.mutateAsync({
      cours_id: vue.cours_id,
      date: vue.date,
      heure_debut: normaliserHeure(vue.heure_debut),
      heure_fin: normaliserHeure(vue.heure_fin ?? vue.heure_debut),
      ...valeurs,
    })

    // On ne referme pas : la présence devient saisissable maintenant.
    setSeanceCreeeId(seance.id)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{vue.cours_libelle}</DialogTitle>
        <DialogDescription>
          {libelleJour(vue.jour_semaine ?? 1)} {formaterDate(vue.date)} ·{' '}
          {normaliserHeure(vue.heure_debut)}
          {vue.heure_fin ? `–${normaliserHeure(vue.heure_fin)}` : ''}
          {vue.type_libelle ? ` · ${vue.type_libelle}` : ''}
        </DialogDescription>
      </DialogHeader>

      {sessionClose && (
        <Alert>
          <Lock className="size-4" aria-hidden="true" />
          <AlertTitle>Session clôturée</AlertTitle>
          <AlertDescription>
            « {session?.nom} » est clôturée : la saisie est arrêtée. Tout reste lisible, et le
            rapport reste téléchargeable. Rouvrez la session depuis Paramètres pour corriger.
          </AlertDescription>
        </Alert>
      )}

      <fieldset disabled={sessionClose} className="contents">
        <form
          id="formulaire-seance"
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

          {enregistrer.isSuccess && (
            <Alert>
              <AlertDescription>Séance enregistrée.</AlertDescription>
            </Alert>
          )}

          {aVerifier && statutSaisi === 'faite' && (
            <Alert>
              <ClipboardCheck className="size-4" aria-hidden="true" />
              <AlertTitle>Exercices donnés la dernière fois</AlertTitle>
              <AlertDescription>
                <span className="block">{aVerifier.exercices}</span>
                <span className="text-xs text-muted-foreground">
                  Séance du {formaterDate(aVerifier.date)}
                </span>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="statut">Statut</Label>
            <Controller
              control={control}
              name="statut"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="statut" className="w-full sm:w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUTS_SEANCE.map((statut) => (
                      <SelectItem key={statut} value={statut}>
                        {LIBELLES_STATUT_SEANCE[statut]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Le motif ne concerne que les séances qui n'ont pas eu lieu. Il est
            remis à `null` par le schéma dès que le statut repasse à « faite » :
            une raison d'annulation ne survit pas à ce qu'elle explique. */}
          {statutSaisi !== 'faite' && (
            <div className="space-y-2">
              <Label htmlFor="motif">Motif</Label>
              <Textarea
                id="motif"
                rows={2}
                placeholder="Pourquoi cette séance n'a-t-elle pas eu lieu ?"
                aria-invalid={Boolean(errors.motif)}
                {...register('motif')}
              />
              {errors.motif && (
                <p className="text-sm text-destructive">{errors.motif.message}</p>
              )}
            </div>
          )}

          {/*
          Tout ce qui suit décrit ce qui s'est PASSÉ. Une séance qui n'a pas eu
          lieu n'a ni contenu, ni sourate, ni exercices : les demander serait
          demander de décrire le néant. Seul le motif reste.

          ⚠️ Masquer n'efface pas. React Hook Form conserve par défaut la valeur
          des champs démontés (`shouldUnregister: false`) : ce qui avait été
          saisi avant l'annulation est toujours envoyé à l'enregistrement, et
          réapparaît si la séance repasse en « faite ». Passer ce réglage à
          `true` viderait silencieusement quatre colonnes — c'est éprouvé par un
          test, précisément parce que le comportement dépend d'un défaut de
          bibliothèque.
        */}
          {statutSaisi === 'faite' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="contenu_aborde">Contenu abordé</Label>
                <Textarea
                  id="contenu_aborde"
                  rows={3}
                  placeholder="Leçon, page de méthode, passage travaillé…"
                  aria-invalid={Boolean(errors.contenu_aborde)}
                  {...register('contenu_aborde')}
                />
                {errors.contenu_aborde && (
                  <p className="text-sm text-destructive">{errors.contenu_aborde.message}</p>
                )}
              </div>

              {/* Bloc repliable : inutile pour l'initiation, central pour la
                  lecture et la mémorisation. */}
              <div className="rounded-lg border">
                <button
                  type="button"
                  onClick={() => setDetailsOuverts((ouvert) => !ouvert)}
                  aria-expanded={detailsOuverts}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
                >
                  Détails Coran (optionnel)
                  <ChevronDown
                    className={cn(
                      'size-4 transition-transform',
                      detailsOuverts && 'rotate-180'
                    )}
                    aria-hidden="true"
                  />
                </button>

                {detailsOuverts && (
                  <div className="space-y-4 border-t p-3">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="sourate_numero">Sourate</Label>
                        <Controller
                          control={control}
                          name="sourate_numero"
                          render={({ field }) => (
                            <SelecteurSourate
                              id="sourate_numero"
                              valeur={
                                field.value === '' || field.value === undefined
                                  ? null
                                  : Number(field.value)
                              }
                              texteOrphelin={texteSourateOrphelin}
                              onChange={(sourate) => {
                                // Les deux colonnes sont écrites ensemble : le numéro
                                // pour l'ordre, le nom canonique pour l'affichage et
                                // la progression, qui lisent encore `sourate`.
                                field.onChange(sourate ? String(sourate.numero) : '')
                                setValue('sourate', sourate?.nom ?? '', { shouldDirty: true })
                              }}
                            />
                          )}
                        />
                        {errors.sourate_numero && (
                          <p className="text-sm text-destructive">
                            {errors.sourate_numero.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="type_travail">Type de travail</Label>
                        <Controller
                          control={control}
                          name="type_travail"
                          render={({ field }) => (
                            <Select
                              value={field.value === '' ? undefined : field.value}
                              onValueChange={field.onChange}
                            >
                              <SelectTrigger id="type_travail" className="w-full">
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent>
                                {TYPES_TRAVAIL.map((type) => (
                                  <SelectItem key={type} value={type}>
                                    {LIBELLES_TYPE_TRAVAIL[type]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="versets_de">Du verset</Label>
                        <Input
                          id="versets_de"
                          inputMode="numeric"
                          aria-invalid={Boolean(errors.versets_de)}
                          {...register('versets_de')}
                        />
                        {errors.versets_de && (
                          <p className="text-sm text-destructive">
                            {errors.versets_de.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="versets_a">Au verset</Label>
                        <Input
                          id="versets_a"
                          inputMode="numeric"
                          aria-invalid={Boolean(errors.versets_a)}
                          {...register('versets_a')}
                        />
                        {errors.versets_a && (
                          <p className="text-sm text-destructive">{errors.versets_a.message}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="exercices_a_faire">Exercices à faire</Label>
                <Textarea
                  id="exercices_a_faire"
                  rows={2}
                  placeholder="À préparer pour la prochaine séance…"
                  aria-invalid={Boolean(errors.exercices_a_faire)}
                  {...register('exercices_a_faire')}
                />
                {errors.exercices_a_faire && (
                  <p className="text-sm text-destructive">{errors.exercices_a_faire.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="observations">Observations</Label>
                <Textarea
                  id="observations"
                  rows={2}
                  aria-invalid={Boolean(errors.observations)}
                  {...register('observations')}
                />
                {errors.observations && (
                  <p className="text-sm text-destructive">{errors.observations.message}</p>
                )}
              </div>
            </>
          )}
        </form>
      </fieldset>

      {/* Affichée quel que soit le format : un cours individuel est justement
          celui où l'évaluation compte le plus. C'est SectionPresence qui décide
          quoi montrer selon le nombre d'inscrits — une ligne, N lignes, ou une
          invitation à inscrire un apprenant.

          Mais uniquement sur une séance TENUE : pointer une présence sur une
          séance annulée ne veut rien dire, et la base le refuse désormais
          (migration 0020). Le bloc de remplacement dit pourquoi plutôt que de
          disparaître — une section escamotée se lit comme une panne. */}
      {sessionClose ? null : refusPresence === null ? (
        <SectionPresence
          coursId={vue.cours_id}
          seanceId={seanceId}
          passageSuggere={aVerifier?.exercices ?? null}
        />
      ) : (
        <BlocPresenceIndisponible refus={refusPresence} seanceId={seanceId} />
      )}

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Fermer</Button>
        </DialogClose>
        <Button
          type="submit"
          form="formulaire-seance"
          disabled={enregistrer.isPending || sessionClose}
        >
          {enregistrer.isPending && (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          )}
          Enregistrer
        </Button>
      </DialogFooter>
    </>
  )
}

export function SeanceFormDialog({ vue, onOuvertChange }: SeanceFormDialogProps) {
  return (
    <Dialog open={Boolean(vue)} onOpenChange={onOuvertChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        {/* La `key` garantit un état neuf à chaque séance ouverte. */}
        {vue && (
          <ContenuSeance key={`${vue.cours_id}-${vue.date}-${vue.heure_debut}`} vue={vue} />
        )}
      </DialogContent>
    </Dialog>
  )
}
