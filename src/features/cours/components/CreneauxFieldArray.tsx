import {
  Controller,
  type Control,
  type FieldErrors,
  type UseFieldArrayReturn,
  type UseFormRegister,
} from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'

import {
  JOURS_SEMAINE,
  creneauParDefaut,
  type CoursFormValues,
  type CoursValues,
} from '@/features/cours/coursSchema'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'

export interface CreneauxFieldArrayProps {
  // Le troisième paramètre est le type transformé par Zod : sans lui, le
  // `control` issu de `useForm<Input, unknown, Output>` n'est pas assignable.
  control: Control<CoursFormValues, unknown, CoursValues>
  champs: UseFieldArrayReturn<CoursFormValues, 'creneaux'>
  register: UseFormRegister<CoursFormValues>
  errors: FieldErrors<CoursFormValues>
  /** Lignes à surligner parce qu'elles entrent en conflit. */
  indexEnConflit: Set<number>
}

/**
 * Lignes de créneaux hebdomadaires (1..N par cours — CLAUDE.md §4).
 * « 2×/semaine » se modélise ici par deux lignes, il n'y a pas de champ fréquence.
 */
export function CreneauxFieldArray({
  control,
  champs,
  register,
  errors,
  indexEnConflit,
}: CreneauxFieldArrayProps) {
  const erreurRacine = errors.creneaux?.message ?? errors.creneaux?.root?.message

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Créneaux hebdomadaires</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => champs.append(creneauParDefaut())}
        >
          <Plus className="size-4" aria-hidden="true" />
          Ajouter un créneau
        </Button>
      </div>

      <ul className="space-y-2">
        {champs.fields.map((champ, index) => {
          const erreurs = errors.creneaux?.[index]
          const enConflit = indexEnConflit.has(index)

          return (
            <li
              key={champ.id}
              className={cn(
                'rounded-lg border p-3',
                enConflit && 'border-destructive bg-destructive/5'
              )}
            >
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-32 flex-1 space-y-1">
                  <Label htmlFor={`creneau-jour-${index}`} className="text-xs">
                    Jour
                  </Label>
                  <Controller
                    control={control}
                    name={`creneaux.${index}.jour_semaine`}
                    render={({ field }) => (
                      <Select value={String(field.value)} onValueChange={field.onChange}>
                        <SelectTrigger id={`creneau-jour-${index}`} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {JOURS_SEMAINE.map((jour) => (
                            <SelectItem key={jour.valeur} value={String(jour.valeur)}>
                              {jour.libelle}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="w-28 space-y-1">
                  <Label htmlFor={`creneau-debut-${index}`} className="text-xs">
                    Début
                  </Label>
                  <Input
                    id={`creneau-debut-${index}`}
                    type="time"
                    aria-invalid={Boolean(erreurs?.heure_debut) || enConflit}
                    {...register(`creneaux.${index}.heure_debut`)}
                  />
                </div>

                <div className="w-28 space-y-1">
                  <Label htmlFor={`creneau-fin-${index}`} className="text-xs">
                    Fin
                  </Label>
                  <Input
                    id={`creneau-fin-${index}`}
                    type="time"
                    aria-invalid={Boolean(erreurs?.heure_fin) || enConflit}
                    {...register(`creneaux.${index}.heure_fin`)}
                  />
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => champs.remove(index)}
                  disabled={champs.fields.length <= 1}
                  aria-label={`Retirer le créneau ${index + 1}`}
                  title={
                    champs.fields.length <= 1
                      ? 'Un cours doit garder au moins un créneau'
                      : 'Retirer ce créneau'
                  }
                >
                  <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                </Button>
              </div>

              {(erreurs?.heure_debut ?? erreurs?.heure_fin ?? erreurs?.jour_semaine) && (
                <p className="mt-2 text-sm text-destructive">
                  {erreurs?.heure_fin?.message ??
                    erreurs?.heure_debut?.message ??
                    erreurs?.jour_semaine?.message}
                </p>
              )}
            </li>
          )
        })}
      </ul>

      {erreurRacine && <p className="text-sm text-destructive">{erreurRacine}</p>}
    </div>
  )
}
