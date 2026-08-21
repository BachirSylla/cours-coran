import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'

import { SelecteurEtatPresence } from '@/features/seances/components/SelecteurEtatPresence'
import { useNoterApprenant } from '@/features/seances/hooks/useNoterApprenant'
import { estPresent, type EtatPresence } from '@/shared/lib/rapport'
import {
  creerEvaluationSchema,
  valeursParDefaut,
  type EvaluationFormValues,
  type EvaluationValues,
} from '@/features/seances/evaluationSchema'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import type { Presence } from '@/shared/supabase/presenceRepo'

export interface LigneEvaluationProps {
  seanceId: string | undefined
  apprenantId: string
  nomComplet: string
  /** État **effectif** : celui de la ligne, ou celui déduit du booléen. */
  etat: EtatPresence
  onChangerEtat: (etat: EtatPresence) => void
  presenceEnCours: boolean
  /** Évaluation déjà enregistrée, s'il y en a une. */
  evaluation: Presence | null
  /** Barème effectif du compte au moment de la saisie. */
  bareme: number
  /** Exercices donnés la dernière fois : suggestion de passage à évaluer. */
  passageSuggere: string | null
}

/**
 * Une ligne par apprenant : présence, puis — s'il était là — la note, un
 * commentaire et le passage récité.
 *
 * L'enregistrement est **explicite** (bouton), pas au blur : une note se tape
 * chiffre par chiffre, et sauvegarder à chaque perte de focus enregistrerait des
 * valeurs à moitié saisies.
 */
export function LigneEvaluation({
  seanceId,
  apprenantId,
  nomComplet,
  etat,
  onChangerEtat,
  presenceEnCours,
  evaluation,
  bareme,
  passageSuggere,
}: LigneEvaluationProps) {
  const noter = useNoterApprenant()
  const identifiant = `presence-${apprenantId}`
  const present = estPresent(etat)

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<EvaluationFormValues, unknown, EvaluationValues>({
    resolver: zodResolver(creerEvaluationSchema(bareme)),
    defaultValues: valeursParDefaut(evaluation, passageSuggere),
  })

  async function onSubmit(valeurs: EvaluationValues) {
    if (!seanceId) return

    await noter.mutateAsync({
      seanceId,
      apprenantId,
      evaluation: {
        ...valeurs,
        // Le barème est figé avec la note : changer de réglage plus tard ne
        // réinterprétera pas cette évaluation.
        note_bareme: valeurs.note === null ? null : bareme,
      },
    })
  }

  return (
    <li className="space-y-3 px-3 py-2">
      <div className="flex items-center gap-3">
        <Checkbox
          id={identifiant}
          checked={present}
          disabled={!seanceId || presenceEnCours}
          onCheckedChange={(coche) => onChangerEtat(coche === true ? 'present' : 'absent')}
        />
        <Label htmlFor={identifiant} className="flex-1 cursor-pointer font-normal">
          {nomComplet}
        </Label>

        {/* Le mot qui rapportait l'état devient le contrôle qui le précise :
            même encombrement, et la case reste le geste rapide. */}
        <SelecteurEtatPresence
          valeur={etat}
          nomComplet={nomComplet}
          onChoisir={onChangerEtat}
          desactive={!seanceId || presenceEnCours}
        />
      </div>

      {/* Noter quelqu'un qui n'était pas là n'a pas de sens. */}
      {seanceId && present && (
        <form
          onSubmit={(evenement) => void handleSubmit(onSubmit)(evenement)}
          className="space-y-2 pl-7"
        >
          <div className="flex flex-wrap items-start gap-2">
            <div className="w-28">
              <Label htmlFor={`note-${apprenantId}`} className="sr-only">
                Note de {nomComplet}
              </Label>
              <div className="flex items-center gap-1">
                <Input
                  id={`note-${apprenantId}`}
                  inputMode="decimal"
                  placeholder="Note"
                  aria-invalid={Boolean(errors.note)}
                  {...register('note')}
                />
                <span className="text-sm text-muted-foreground">/{bareme}</span>
              </div>
            </div>

            <div className="min-w-40 flex-1">
              <Label htmlFor={`passage-${apprenantId}`} className="sr-only">
                Passage évalué pour {nomComplet}
              </Label>
              <Input
                id={`passage-${apprenantId}`}
                placeholder="Passage récité"
                aria-invalid={Boolean(errors.passage_evalue)}
                {...register('passage_evalue')}
              />
            </div>

            <div className="min-w-40 flex-1">
              <Label htmlFor={`commentaire-${apprenantId}`} className="sr-only">
                Commentaire sur {nomComplet}
              </Label>
              <Input
                id={`commentaire-${apprenantId}`}
                placeholder="Commentaire"
                aria-invalid={Boolean(errors.commentaire)}
                {...register('commentaire')}
              />
            </div>

            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={!isDirty || noter.isPending}
            >
              {noter.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              Enregistrer
            </Button>
          </div>

          {(errors.note ?? errors.passage_evalue ?? errors.commentaire) && (
            <p className="text-sm text-destructive">
              {errors.note?.message ??
                errors.passage_evalue?.message ??
                errors.commentaire?.message}
            </p>
          )}

          {noter.isError && <p className="text-sm text-destructive">{noter.error.message}</p>}

          {noter.isSuccess && !isDirty && (
            <p className="text-xs text-muted-foreground">Évaluation enregistrée.</p>
          )}
        </form>
      )}
    </li>
  )
}
