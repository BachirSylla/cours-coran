import { BookOpen, Loader2, Pencil, TriangleAlert } from 'lucide-react'

import { SectionProgression } from '@/features/apprenants/components/SectionProgression'
import { StatutApprenantBadge } from '@/features/apprenants/components/StatutApprenantBadge'
import { abregeJour, LIBELLES_FORMAT, type FormatCours } from '@/features/cours/coursSchema'
import { useInscriptionsApprenant } from '@/features/inscriptions/hooks/useInscriptionsApprenant'
import type { Apprenant } from '@/shared/supabase/apprenantRepo'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'

export interface ApprenantDetailDialogProps {
  apprenant: Apprenant | null
  onOuvertChange: (ouvert: boolean) => void
  onModifier: (apprenant: Apprenant) => void
}

function formaterDate(date: string): string {
  const [annee, mois, jour] = date.split('-')
  return annee && mois && jour ? `${jour}/${mois}/${annee}` : date
}

function formatValide(format: string): FormatCours {
  return format === 'groupe' ? 'groupe' : 'individuel'
}

/** Fiche d'un apprenant et cours auxquels il est inscrit. */
export function ApprenantDetailDialog({
  apprenant,
  onOuvertChange,
  onModifier,
}: ApprenantDetailDialogProps) {
  const {
    data: inscriptions,
    isPending,
    isError,
    error,
  } = useInscriptionsApprenant(apprenant?.id)

  const liste = inscriptions ?? []

  return (
    <Dialog open={Boolean(apprenant)} onOpenChange={onOuvertChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {apprenant && (
          <>
            <DialogHeader>
              <DialogTitle>
                {apprenant.prenom} {apprenant.nom}
              </DialogTitle>
              <DialogDescription>
                Inscrit le {formaterDate(apprenant.date_inscription)}
                {apprenant.niveau ? ` · ${apprenant.niveau}` : ''}
              </DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-muted-foreground">Contact</dt>
                <dd className="text-sm">{apprenant.contact ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Statut</dt>
                <dd>
                  <StatutApprenantBadge statut={apprenant.statut} />
                </dd>
              </div>
              {apprenant.notes && (
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Notes</dt>
                  <dd className="text-sm whitespace-pre-line">{apprenant.notes}</dd>
                </div>
              )}
            </dl>

            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <BookOpen className="size-4 text-muted-foreground" aria-hidden="true" />
                Cours suivis
                {liste.length > 0 && (
                  <span className="font-normal text-muted-foreground">({liste.length})</span>
                )}
              </h3>

              {isPending && (
                <p
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Chargement des cours…
                </p>
              )}

              {isError && (
                <Alert variant="destructive">
                  <TriangleAlert className="size-4" aria-hidden="true" />
                  <AlertDescription>{error.message}</AlertDescription>
                </Alert>
              )}

              {!isPending && !isError && liste.length === 0 && (
                <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  Cet apprenant n'est inscrit à aucun cours.
                </p>
              )}

              {liste.length > 0 && (
                <ul className="divide-y rounded-lg border">
                  {liste.map((inscription) => (
                    <li key={inscription.id} className="px-3 py-2">
                      <p className="truncate text-sm font-medium">
                        {inscription.cours?.libelle}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {inscription.cours?.type_cours?.libelle ?? '—'}
                        {inscription.cours &&
                          ` · ${LIBELLES_FORMAT[formatValide(inscription.cours.format)]}`}
                      </p>
                      {inscription.cours && inscription.cours.creneau.length > 0 && (
                        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                          {inscription.cours.creneau
                            .map(
                              (creneau) =>
                                `${abregeJour(creneau.jour_semaine)} ${creneau.heure_debut.slice(0, 5)}–${creneau.heure_fin.slice(0, 5)}`
                            )
                            .join(' · ')}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <SectionProgression apprenantId={apprenant.id} />

            <DialogFooter>
              <Button variant="outline" onClick={() => onOuvertChange(false)}>
                Fermer
              </Button>
              <Button onClick={() => onModifier(apprenant)}>
                <Pencil className="size-4" aria-hidden="true" />
                Modifier la fiche
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
