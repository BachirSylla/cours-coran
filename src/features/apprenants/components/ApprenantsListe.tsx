import { Pencil, Trash2 } from 'lucide-react'

import { StatutApprenantBadge } from '@/features/apprenants/components/StatutApprenantBadge'
import type { Apprenant } from '@/shared/supabase/apprenantRepo'
import { Button } from '@/shared/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table'

export interface ApprenantsListeProps {
  apprenants: Apprenant[]
  onOuvrir: (apprenant: Apprenant) => void
  onModifier: (apprenant: Apprenant) => void
  onSupprimer: (apprenant: Apprenant) => void
  /**
   * Créer, modifier et supprimer une fiche relèvent de la gestion : réservé au
   * responsable du centre. L'enseignant voit l'identité de ses apprenants, il
   * ne tient pas leur fiche (migration 0012).
   */
  actionsGestion?: boolean
}

function formaterDate(date: string): string {
  const [annee, mois, jour] = date.split('-')
  return annee && mois && jour ? `${jour}/${mois}/${annee}` : date
}

/**
 * Liste des apprenants — composant **présentational pur** : il ne connaît ni
 * TanStack Query ni Supabase, seulement des données et des rappels.
 *
 * Tableau sur écran large, cartes empilées sur mobile (le tableau ne tient pas
 * sur un téléphone, or l'app est utilisée sur les trois formats).
 */
export function ApprenantsListe({
  apprenants,
  onOuvrir,
  onModifier,
  onSupprimer,
  actionsGestion = true,
}: ApprenantsListeProps) {
  return (
    <>
      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Niveau</TableHead>
              <TableHead>Inscrit le</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apprenants.map((apprenant) => (
              <TableRow key={apprenant.id}>
                <TableCell className="font-medium">
                  <button
                    type="button"
                    onClick={() => onOuvrir(apprenant)}
                    className="text-left hover:text-primary hover:underline"
                  >
                    {apprenant.prenom} {apprenant.nom}
                  </button>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {apprenant.contact ?? '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {apprenant.niveau ?? '—'}
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {formaterDate(apprenant.date_inscription)}
                </TableCell>
                <TableCell>
                  <StatutApprenantBadge statut={apprenant.statut} />
                </TableCell>
                <TableCell className="text-right">
                  {actionsGestion && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onModifier(apprenant)}
                        aria-label={`Modifier ${apprenant.prenom} ${apprenant.nom}`}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onSupprimer(apprenant)}
                        aria-label={`Supprimer ${apprenant.prenom} ${apprenant.nom}`}
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
        {apprenants.map((apprenant) => (
          <li key={apprenant.id} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => onOuvrir(apprenant)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate font-medium">
                  {apprenant.prenom} {apprenant.nom}
                </p>
                {apprenant.contact && (
                  <p className="truncate text-sm text-muted-foreground">{apprenant.contact}</p>
                )}
              </button>
              <StatutApprenantBadge statut={apprenant.statut} />
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div>
                <dt className="font-medium">Niveau</dt>
                <dd>{apprenant.niveau ?? '—'}</dd>
              </div>
              <div>
                <dt className="font-medium">Inscrit le</dt>
                <dd className="tabular-nums">{formaterDate(apprenant.date_inscription)}</dd>
              </div>
            </dl>

            {actionsGestion && (
              <div className="mt-3 flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onModifier(apprenant)}
                  aria-label={`Modifier ${apprenant.prenom} ${apprenant.nom}`}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  Modifier
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSupprimer(apprenant)}
                  aria-label={`Supprimer ${apprenant.prenom} ${apprenant.nom}`}
                >
                  <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                  Supprimer
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
