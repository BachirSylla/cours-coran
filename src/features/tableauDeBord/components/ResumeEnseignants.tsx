import type { ResumeEnseignant } from '@/shared/lib/tableauDeBord'
import { Badge } from '@/shared/ui/badge'

export interface ResumeEnseignantsProps {
  enseignants: ResumeEnseignant[]
}

/**
 * Qui porte quoi.
 *
 * Trié par retard de saisie : la première ligne est celle qu'il faut relancer.
 * Les cours **sans enseignant** forment leur propre ligne plutôt que de
 * disparaître — ce sont précisément ceux dont personne ne s'occupe.
 */
export function ResumeEnseignants({ enseignants }: ResumeEnseignantsProps) {
  if (enseignants.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        Aucun cours actif dans cette session.
      </p>
    )
  }

  return (
    <ul className="divide-y rounded-lg border">
      {enseignants.map((enseignant) => (
        <li
          key={enseignant.user_id ?? 'orphelins'}
          className="flex items-center gap-3 px-3 py-2.5"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{enseignant.nom}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {enseignant.cours} cours · {enseignant.apprenants} apprenant
              {enseignant.apprenants > 1 ? 's' : ''}
            </p>
          </div>

          {enseignant.aNoter > 0 && (
            <Badge variant="secondary" className="tabular-nums">
              {enseignant.aNoter} à noter
            </Badge>
          )}
        </li>
      ))}
    </ul>
  )
}
