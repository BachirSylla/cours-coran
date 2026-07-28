import { CalendarCheck, Loader2 } from 'lucide-react'

import { StatutSeanceBadge } from '@/features/seances/components/StatutSeanceBadge'
import { useSeancesCours } from '@/features/seances/hooks/useSeancesCours'
import type { SeanceVueEnrichie } from '@/features/seances/regroupement'
import { normaliserHeure } from '@/shared/lib/seances'
import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'
import type { Seance } from '@/shared/supabase/seanceRepo'

export interface SeancesRecentesCoursProps {
  cours: CoursAvecDetails
  onOuvrir: (vue: SeanceVueEnrichie) => void
  /** Nombre de séances affichées. */
  limite?: number
}

function formaterDate(date: string): string {
  const [annee, mois, jour] = date.split('-')
  return annee && mois && jour ? `${jour}/${mois}/${annee}` : date
}

/** Transforme une séance enregistrée en vue exploitable par le formulaire. */
function versVue(seance: Seance, cours: CoursAvecDetails): SeanceVueEnrichie {
  return {
    cours_id: cours.id,
    date: seance.date,
    jour_semaine: null,
    heure_debut: seance.heure_debut,
    heure_fin: seance.heure_fin,
    seance,
    saisie: true,
    orpheline: false,
    cours_libelle: cours.libelle,
    type_libelle: cours.type_cours?.libelle ?? null,
    format: cours.format,
  }
}

/** Dernières séances saisies d'un cours, avec accès direct à la saisie. */
export function SeancesRecentesCours({
  cours,
  onOuvrir,
  limite = 5,
}: SeancesRecentesCoursProps) {
  const { data: seances, isPending } = useSeancesCours(cours.id)

  const recentes = (seances ?? []).slice(0, limite)

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <CalendarCheck className="size-4 text-muted-foreground" aria-hidden="true" />
        Séances récentes
        {recentes.length > 0 && (
          <span className="font-normal text-muted-foreground">({seances?.length ?? 0})</span>
        )}
      </h3>

      {isPending && (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Chargement des séances…
        </p>
      )}

      {!isPending && recentes.length === 0 && (
        <p className="rounded-lg border border-dashed px-4 py-4 text-center text-sm text-muted-foreground">
          Aucune séance saisie pour ce cours.
        </p>
      )}

      {recentes.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {recentes.map((seance) => {
            const vue = versVue(seance, cours)

            return (
              <li key={seance.id}>
                <button
                  type="button"
                  onClick={() => onOuvrir(vue)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50"
                >
                  <span className="w-28 shrink-0 text-sm text-muted-foreground tabular-nums">
                    {formaterDate(seance.date)}
                  </span>
                  <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
                    {normaliserHeure(seance.heure_debut)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {seance.contenu_aborde ?? '—'}
                  </span>
                  <StatutSeanceBadge vue={vue} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
