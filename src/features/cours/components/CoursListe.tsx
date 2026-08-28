import { Pencil, Trash2 } from 'lucide-react'

import { LienMeet } from '@/features/cours/components/LienMeet'
import {
  abregeJour,
  LIBELLES_FORMAT,
  LIBELLES_STATUT_COURS,
  type FormatCours,
  type StatutCours,
} from '@/features/cours/coursSchema'
import { cn } from '@/shared/lib/utils'
import { nombreInscrits, type CoursAvecDetails } from '@/shared/supabase/coursRepo'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table'

export interface CoursListeProps {
  cours: CoursAvecDetails[]
  onOuvrir: (cours: CoursAvecDetails) => void
  onModifier: (cours: CoursAvecDetails) => void
  onSupprimer: (cours: CoursAvecDetails) => void
  /**
   * Modifier et supprimer un cours relèvent de la gestion : réservé au
   * responsable du centre (migration 0012).
   */
  actionsGestion?: boolean
}

const CLASSES_STATUT: Record<StatutCours, string> = {
  actif: 'border-transparent bg-primary/10 text-primary',
  pause: 'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400',
  termine: 'border-transparent bg-muted text-muted-foreground',
}

function statutValide(statut: string): StatutCours {
  return statut === 'pause' || statut === 'termine' ? statut : 'actif'
}

function formatValide(format: string): FormatCours {
  return format === 'groupe' ? 'groupe' : 'individuel'
}

/** « Lun 10:00–11:00 · Mer 15:00–16:00 » */
function resumerCreneaux(creneaux: CoursAvecDetails['creneau']): string {
  if (creneaux.length === 0) return '—'

  return creneaux
    .map(
      (creneau) =>
        `${abregeJour(creneau.jour_semaine)} ${creneau.heure_debut.slice(0, 5)}–${creneau.heure_fin.slice(0, 5)}`
    )
    .join(' · ')
}

/** Liste des cours — composant présentational pur. */
export function CoursListe({
  cours,
  onOuvrir,
  onModifier,
  onSupprimer,
  actionsGestion = true,
}: CoursListeProps) {
  return (
    <>
      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cours</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Créneaux</TableHead>
              <TableHead>Apprenants</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Meet</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cours.map((unCours) => (
              <TableRow key={unCours.id}>
                <TableCell className="font-medium">
                  <button
                    type="button"
                    onClick={() => onOuvrir(unCours)}
                    className="text-left hover:text-primary hover:underline"
                  >
                    {unCours.libelle}
                  </button>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {unCours.type_cours?.libelle ?? '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {LIBELLES_FORMAT[formatValide(unCours.format)]}
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {resumerCreneaux(unCours.creneau)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {nombreInscrits(unCours)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(CLASSES_STATUT[statutValide(unCours.statut)])}
                  >
                    {LIBELLES_STATUT_COURS[statutValide(unCours.statut)]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <LienMeet lien={unCours.lien_meet} />
                </TableCell>
                <TableCell className="text-right">
                  {actionsGestion && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onModifier(unCours)}
                        aria-label={`Modifier ${unCours.libelle}`}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onSupprimer(unCours)}
                        aria-label={`Supprimer ${unCours.libelle}`}
                      >
                        <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="space-y-3 md:hidden">
        {cours.map((unCours) => (
          <li key={unCours.id} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => onOuvrir(unCours)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate font-medium">{unCours.libelle}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {unCours.type_cours?.libelle ?? '—'} ·{' '}
                  {LIBELLES_FORMAT[formatValide(unCours.format)]} · {nombreInscrits(unCours)}{' '}
                  {nombreInscrits(unCours) > 1 ? 'apprenants' : 'apprenant'}
                </p>
              </button>
              <Badge
                variant="outline"
                className={cn(CLASSES_STATUT[statutValide(unCours.statut)])}
              >
                {LIBELLES_STATUT_COURS[statutValide(unCours.statut)]}
              </Badge>
            </div>

            <p className="mt-3 text-xs text-muted-foreground tabular-nums">
              {resumerCreneaux(unCours.creneau)}
            </p>

            <div className="mt-3 flex items-center justify-between">
              <LienMeet lien={unCours.lien_meet} />
              {actionsGestion && (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onModifier(unCours)}
                    aria-label={`Modifier ${unCours.libelle}`}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                    Modifier
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSupprimer(unCours)}
                    aria-label={`Supprimer ${unCours.libelle}`}
                  >
                    <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                    Supprimer
                  </Button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
