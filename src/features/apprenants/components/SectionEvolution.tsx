import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Loader2,
  Minus,
  TriangleAlert,
} from 'lucide-react'

import { Sparkline } from '@/features/apprenants/components/Sparkline'
import { useEvaluationsApprenant } from '@/features/apprenants/hooks/useEvaluationsApprenant'
import type { EvolutionCours } from '@/features/apprenants/hooks/useEvaluationsApprenant'
import { formaterNote, LIBELLES_TENDANCE, type Tendance } from '@/shared/lib/evaluations'
import { cn } from '@/shared/lib/utils'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Badge } from '@/shared/ui/badge'

const APPARENCE: Record<Tendance, { icone: typeof ArrowUpRight; classe: string }> = {
  progression: { icone: ArrowUpRight, classe: 'border-transparent bg-primary/10 text-primary' },
  stable: { icone: ArrowRight, classe: 'border-transparent bg-muted text-muted-foreground' },
  baisse: {
    icone: ArrowDownRight,
    classe: 'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400',
  },
  insuffisant: { icone: Minus, classe: 'border-dashed text-muted-foreground' },
}

function formaterDate(date: string): string {
  const [annee, mois, jour] = date.split('-')
  return annee && mois && jour ? `${jour}/${mois}/${annee}` : date
}

function BadgeTendance({ tendance }: { tendance: Tendance }) {
  const { icone: Icone, classe } = APPARENCE[tendance]

  return (
    <Badge variant="outline" className={cn('gap-1', classe)}>
      <Icone className="size-3" aria-hidden="true" />
      {LIBELLES_TENDANCE[tendance]}
    </Badge>
  )
}

function CarteEvolution({ cours_libelle, evaluations, tendance }: EvolutionCours) {
  return (
    <li className="space-y-3 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{cours_libelle}</p>
        <Sparkline
          valeurs={evaluations.map((evaluation) => evaluation.pourcentage)}
          titre={`Évolution des notes — ${cours_libelle}`}
        />
        <BadgeTendance tendance={tendance} />
      </div>

      <ol className="divide-y">
        {[...evaluations].reverse().map((evaluation) => (
          <li key={evaluation.id} className="flex items-baseline gap-3 py-1.5">
            <span className="w-20 shrink-0 text-xs text-muted-foreground tabular-nums">
              {formaterDate(evaluation.date)}
            </span>
            <span className="min-w-0 flex-1">
              {evaluation.passage_evalue && (
                <span className="block truncate text-xs">{evaluation.passage_evalue}</span>
              )}
              {evaluation.commentaire && (
                <span className="block truncate text-xs text-muted-foreground">
                  {evaluation.commentaire}
                </span>
              )}
            </span>
            <span className="shrink-0 text-sm font-medium tabular-nums">
              {formaterNote(evaluation.note, evaluation.note_bareme)}
            </span>
          </li>
        ))}
      </ol>
    </li>
  )
}

/** Évolution de la récitation d'un apprenant, cours par cours. */
export function SectionEvolution({ apprenantId }: { apprenantId: string }) {
  const { parCours, isPending, isError, error } = useEvaluationsApprenant(apprenantId)

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <ArrowUpRight className="size-4 text-muted-foreground" aria-hidden="true" />
        Évolution de la récitation
      </h3>

      {isPending && (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Chargement des évaluations…
        </p>
      )}

      {isError && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertDescription>{error?.message}</AlertDescription>
        </Alert>
      )}

      {!isPending && !isError && parCours.length === 0 && (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Aucune récitation notée pour le moment. Les notes se saisissent lors de la saisie
          d'une séance.
        </p>
      )}

      {parCours.length > 0 && (
        <ul className="space-y-3">
          {parCours.map((evolution) => (
            <CarteEvolution key={evolution.cours_id} {...evolution} />
          ))}
        </ul>
      )}
    </section>
  )
}
