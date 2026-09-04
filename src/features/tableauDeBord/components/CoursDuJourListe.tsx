import { Link } from 'react-router'
import { CalendarCheck, ExternalLink, PenLine } from 'lucide-react'

import type { CoursDuJour } from '@/features/tableauDeBord/hooks/useTableauDeBord'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'

export interface CoursDuJourListeProps {
  cours: CoursDuJour[]
}

/** `10:00:00` → `10:00`. */
function heure(valeur: string): string {
  return valeur.slice(0, 5)
}

/**
 * Les cours d'aujourd'hui.
 *
 * ⚠️ Le bouton s'appelle **« Lien »**, jamais « Meet » : `cours.lien_meet` n'est
 * qu'une URL, et tous les centres ne sont pas sur Google — certains utilisent
 * Zoom, d'autres un lien de salle. Nommer l'outil dans l'interface serait faux
 * pour une partie des utilisateurs, et vieillirait mal.
 */
export function CoursDuJourListe({ cours }: CoursDuJourListeProps) {
  if (cours.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center">
        <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <CalendarCheck className="size-4" aria-hidden="true" />
        </span>
        <p className="text-sm font-medium">Aucun cours aujourd'hui</p>
        <p className="text-xs text-muted-foreground">La semaine se consulte dans le planning.</p>
      </div>
    )
  }

  return (
    <ul className="divide-y rounded-lg border">
      {cours.map((unCours) => (
        <li
          key={`${unCours.cours_id}-${unCours.heure_debut}`}
          className="flex flex-wrap items-center gap-3 px-3 py-2.5"
        >
          <span className="w-14 shrink-0 text-sm font-semibold tabular-nums">
            {heure(unCours.heure_debut)}
          </span>

          <div className="min-w-40 flex-1">
            <p className="truncate text-sm font-medium">{unCours.libelle}</p>
            <p className="truncate text-xs text-muted-foreground">{unCours.enseignant}</p>
          </div>

          {unCours.aNoter && (
            <Badge variant="secondary" className="gap-1">
              <PenLine className="size-3" aria-hidden="true" />À noter
            </Badge>
          )}

          {unCours.lien && (
            <Button asChild variant="outline" size="sm">
              <a href={unCours.lien} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3.5" aria-hidden="true" />
                Lien
              </a>
            </Button>
          )}

          <Button asChild variant="ghost" size="sm">
            <Link to="/seances">Saisir</Link>
          </Button>
        </li>
      ))}
    </ul>
  )
}
