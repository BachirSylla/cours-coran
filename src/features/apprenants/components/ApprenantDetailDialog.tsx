import { BookOpen, Loader2, Pencil, TriangleAlert } from 'lucide-react'

import { SectionEvolution } from '@/features/apprenants/components/SectionEvolution'
import { SectionProgression } from '@/features/apprenants/components/SectionProgression'
import { StatutApprenantBadge } from '@/features/apprenants/components/StatutApprenantBadge'
import { abregeJour, LIBELLES_FORMAT, type FormatCours } from '@/features/cours/coursSchema'
import { useInscriptionsApprenant } from '@/features/inscriptions/hooks/useInscriptionsApprenant'
import type { Apprenant } from '@/shared/supabase/apprenantRepo'
import type { InscriptionAvecCours } from '@/shared/supabase/inscriptionRepo'
import { SESSION_TERMINEE } from '@/shared/supabase/sessionRepo'
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
  /** Tenir la fiche relève de la gestion : réservé au responsable (0012). */
  actionsGestion?: boolean
}

function formaterDate(date: string): string {
  const [annee, mois, jour] = date.split('-')
  return annee && mois && jour ? `${jour}/${mois}/${annee}` : date
}

function formatValide(format: string): FormatCours {
  return format === 'groupe' ? 'groupe' : 'individuel'
}

/**
 * Regroupe les inscriptions par session, en préservant l'ordre du repository —
 * du plus récent au plus ancien.
 *
 * ⚠️ Ne réunit que les suites CONSÉCUTIVES, et ne retrie rien : c'est
 * `listByApprenant` qui garantit qu'une session forme un bloc d'un seul tenant,
 * en départageant par identifiant de session AVANT le libellé du cours. Les deux
 * vont ensemble — relâcher ce tri ferait réapparaître le même en-tête deux fois,
 * avec une clé React dupliquée.
 *
 * Le repli sur `cours: null` est défensif, et rien de plus : la policy
 * `inscription_select` porte sur `cours_lisibles()`, donc elle écarte la LIGNE
 * entière — un embed vide ne remonte jamais de ce chemin. Mais le type de
 * PostgREST autorise `null`, et afficher « undefined » vaudrait moins que de
 * dire qu'on ne sait pas.
 */
function grouperParSession(
  inscriptions: InscriptionAvecCours[]
): { cle: string; nom: string | null; statut: string | null; cours: InscriptionAvecCours[] }[] {
  const groupes: {
    cle: string
    nom: string | null
    statut: string | null
    cours: InscriptionAvecCours[]
  }[] = []

  for (const inscription of inscriptions) {
    const session = inscription.cours?.session ?? null
    const cle = session?.id ?? 'sans-session'
    const dernier = groupes.at(-1)

    if (dernier?.cle === cle) {
      dernier.cours.push(inscription)
      continue
    }

    groupes.push({
      cle,
      nom: session?.nom ?? null,
      statut: session?.statut ?? null,
      cours: [inscription],
    })
  }

  return groupes
}

/** Fiche d'un apprenant et cours auxquels il est inscrit. */
export function ApprenantDetailDialog({
  apprenant,
  onOuvertChange,
  onModifier,
  actionsGestion = true,
}: ApprenantDetailDialogProps) {
  const {
    data: inscriptions,
    isPending,
    isError,
    error,
  } = useInscriptionsApprenant(apprenant?.id)

  const liste = inscriptions ?? []
  const parSession = grouperParSession(liste)

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
                Parcours
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

              {/*
                Une session par bloc, de la plus récente à la plus ancienne :
                c'est ce qui transforme une liste de cours en progression. Sans
                cet en-tête, « Coran niveau 1 » et « Coran niveau 2 » se lisent
                comme deux cours suivis en même temps.
              */}
              {parSession.map((groupe) => (
                <div key={groupe.cle} className="space-y-1.5">
                  <p className="flex items-baseline gap-2 text-xs font-medium text-muted-foreground">
                    {groupe.nom ?? 'Session non lisible'}
                    {/* ⚠️ La constante, jamais le littéral : la base n'accepte que
                        `en_cours` et `terminee`, et un « cloturee » écrit à la main
                        est une branche morte que rien ne signale. */}
                    {groupe.statut === SESSION_TERMINEE && (
                      <span className="font-normal">· terminée</span>
                    )}
                  </p>

                  <ul className="divide-y rounded-lg border">
                    {groupe.cours.map((inscription) => (
                      <li key={inscription.id} className="px-3 py-2">
                        <p className="truncate text-sm font-medium">
                          {inscription.cours?.libelle ?? 'Cours non lisible'}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {inscription.cours?.type_cours?.libelle ?? '—'}
                          {inscription.cours &&
                            ` · ${LIBELLES_FORMAT[formatValide(inscription.cours.format)]}`}
                          {inscription.cours?.niveau ? ` · ${inscription.cours.niveau}` : ''}
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
                </div>
              ))}
            </section>

            <SectionProgression apprenantId={apprenant.id} />

            <SectionEvolution apprenantId={apprenant.id} />

            <DialogFooter>
              <Button variant="outline" onClick={() => onOuvertChange(false)}>
                Fermer
              </Button>
              {actionsGestion && (
                <Button onClick={() => onModifier(apprenant)}>
                  <Pencil className="size-4" aria-hidden="true" />
                  Modifier la fiche
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
