import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Info, Loader2, TriangleAlert } from 'lucide-react'

import { useEnregistrerNotation } from '@/features/parametres/hooks/useEnregistrerNotation'
import {
  notationSchema,
  valeursParDefaut,
  type NotationFormValues,
  type NotationValues,
} from '@/features/parametres/notationSchema'
import { noteAssiduite, TOTAL_NOTE_FINALE } from '@/shared/lib/rapport'
import type { ParametresEffectifs } from '@/shared/supabase/parametresRepo'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'

/** L'exemple qui rend les pénalités concrètes. */
const EXEMPLE = { absences: 2, retards: 1 }

export interface SectionNotationProps {
  parametres: ParametresEffectifs
}

/**
 * Réglages de la note finale de session.
 *
 * Une seule part est saisissable — l'assiduité — et la part académique est ce
 * qui reste. La somme ne peut donc pas être fausse : elle est imposée par la
 * forme du formulaire, pas rattrapée par un message d'erreur.
 */
export function SectionNotation({ parametres }: SectionNotationProps) {
  const enregistrer = useEnregistrerNotation()

  const valeursInitiales = valeursParDefaut(parametres)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isDirty },
  } = useForm<NotationFormValues, unknown, NotationValues>({
    resolver: zodResolver(notationSchema),
    defaultValues: valeursInitiales,
  })

  // `useWatch` plutôt que `watch()` : ce dernier renvoie une fonction que le
  // compilateur React ne peut pas mémoïser, ce qui lui fait abandonner la
  // mémoïsation de tout le composant.
  const saisie = useWatch({ control, defaultValue: valeursInitiales })
  const apercu = calculerApercu(saisie)

  async function onSubmit(valeurs: NotationValues) {
    await enregistrer.mutateAsync(valeurs)
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4">
      <div>
        <h2 className="text-sm font-medium">Notation de fin de session</h2>
        <p className="text-sm text-muted-foreground">
          La note finale est toujours sur {TOTAL_NOTE_FINALE} : l'examen de fin de session, plus
          l'assiduité.
        </p>
      </div>

      <form
        onSubmit={(evenement) => void handleSubmit(onSubmit)(evenement)}
        className="space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="bareme-assiduite">Part de l'assiduité</Label>
            <div className="flex items-center gap-2">
              <Input
                id="bareme-assiduite"
                inputMode="numeric"
                aria-invalid={Boolean(errors.bareme_assiduite)}
                {...register('bareme_assiduite')}
              />
              <span className="text-sm text-muted-foreground">/ {TOTAL_NOTE_FINALE}</span>
            </div>
            {/* La part académique n'est pas saisie : elle est ce qui reste. */}
            <p className="text-xs text-muted-foreground">
              Examen : <span className="text-foreground">{apercu.academique}</span> /{' '}
              {TOTAL_NOTE_FINALE}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="penalite-absence">Pénalité par absence</Label>
            <Input
              id="penalite-absence"
              inputMode="decimal"
              aria-invalid={Boolean(errors.penalite_absence)}
              {...register('penalite_absence')}
            />
            <p className="text-xs text-muted-foreground">points retirés à l'assiduité</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="penalite-retard">Pénalité par retard</Label>
            <Input
              id="penalite-retard"
              inputMode="decimal"
              aria-invalid={Boolean(errors.penalite_retard)}
              {...register('penalite_retard')}
            />
            <p className="text-xs text-muted-foreground">
              une présence partielle ne coûte rien
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Checkbox
            id="penaliser-excusees"
            checked={saisie.penaliser_absences_excusees ?? false}
            onCheckedChange={(coche) =>
              setValue('penaliser_absences_excusees', coche === true, { shouldDirty: true })
            }
          />
          <Label htmlFor="penaliser-excusees" className="font-normal">
            Les absences excusées retirent aussi des points
          </Label>
        </div>

        {apercu.exemple !== null && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            Avec ces réglages, un apprenant ayant {EXEMPLE.absences} absences et{' '}
            {EXEMPLE.retards} retard obtiendrait{' '}
            <span className="font-medium text-foreground">
              {formaterPoints(apercu.exemple)} / {apercu.assiduite}
            </span>{' '}
            en assiduité.
          </p>
        )}

        {messagePremiereErreur(errors) && (
          <p className="text-sm text-destructive">{messagePremiereErreur(errors)}</p>
        )}

        {enregistrer.isError && (
          <Alert variant="destructive">
            <TriangleAlert className="size-4" aria-hidden="true" />
            <AlertDescription>{enregistrer.error.message}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!isDirty || enregistrer.isPending}>
            {enregistrer.isPending && (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            )}
            Enregistrer
          </Button>

          {enregistrer.isSuccess && !isDirty && (
            <span className="text-xs text-muted-foreground">Réglages enregistrés.</span>
          )}
        </div>
      </form>

      <Alert>
        <Info className="size-4" aria-hidden="true" />
        <AlertDescription>
          L'assiduité part de son maximum et ne descend jamais sous zéro. Une absence excusée
          reste visible dans le bilan même lorsqu'elle ne retire aucun point.
        </AlertDescription>
      </Alert>
    </section>
  )
}

/** `1.25` → « 1,25 » : virgule décimale française, sans décimale superflue. */
function formaterPoints(valeur: number): string {
  return String(Math.round(valeur * 100) / 100).replace('.', ',')
}

/**
 * Aperçu recalculé à chaque frappe. Il passe par `noteAssiduite`, la fonction
 * du rapport lui-même : ce qui est montré ici est exactement ce qui sera
 * calculé — pas une approximation d'affichage.
 */
function calculerApercu(saisie: Partial<NotationFormValues>) {
  const resultat = notationSchema.safeParse(saisie)

  if (!resultat.success) {
    return { academique: '—', assiduite: '—', exemple: null }
  }

  const config = resultat.data

  return {
    academique: String(config.bareme_academique),
    assiduite: String(config.bareme_assiduite),
    exemple: noteAssiduite(
      {
        presences: 0,
        absences: EXEMPLE.absences,
        retards: EXEMPLE.retards,
        excusees: 0,
        partiels: 0,
        total: EXEMPLE.absences + EXEMPLE.retards,
      },
      config
    ),
  }
}

function messagePremiereErreur(
  errors: Partial<Record<keyof NotationFormValues, { message?: string }>>
): string | undefined {
  return (
    errors.bareme_assiduite?.message ??
    errors.penalite_absence?.message ??
    errors.penalite_retard?.message
  )
}
