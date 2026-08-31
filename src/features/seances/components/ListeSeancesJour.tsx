import { libelleJour } from '@/features/cours/coursSchema'
import { StatutSeanceBadge } from '@/features/seances/components/StatutSeanceBadge'
import type { GroupeJour, SeanceVueEnrichie } from '@/features/seances/regroupement'
import { normaliserHeure } from '@/shared/lib/seances'
import { cn } from '@/shared/lib/utils'

export interface ListeSeancesJourProps {
  groupe: GroupeJour
  /** Met en évidence la journée en cours. */
  estAujourdhui: boolean
  onOuvrir: (vue: SeanceVueEnrichie) => void
  /** Compte connecté : seul l'enseignant affecté saisit une séance (0017). */
  userId: string | null
}

function formaterDate(date: string): string {
  const [, mois, jour] = date.split('-')
  return `${jour}/${mois}`
}

/** Séances d'une journée — composant présentational pur. */
export function ListeSeancesJour({
  groupe,
  estAujourdhui,
  onOuvrir,
  userId,
}: ListeSeancesJourProps) {
  return (
    <section className="space-y-2">
      <h2
        className={cn(
          'flex items-baseline gap-2 text-sm font-medium',
          estAujourdhui && 'text-primary'
        )}
      >
        {libelleJour(groupe.jour_semaine)}
        <span className="text-xs text-muted-foreground tabular-nums">
          {formaterDate(groupe.date)}
        </span>
        {estAujourdhui && <span className="text-xs text-primary">· aujourd’hui</span>}
      </h2>

      <ul className="divide-y rounded-lg border">
        {groupe.vues.map((vue) => (
          <li key={`${vue.cours_id}-${vue.date}-${vue.heure_debut}`}>
            <button
              type="button"
              disabled={vue.enseignant_id !== userId}
              onClick={() => onOuvrir(vue)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50"
            >
              <span className="w-24 shrink-0 text-sm text-muted-foreground tabular-nums">
                {normaliserHeure(vue.heure_debut)}
                {vue.heure_fin ? `–${normaliserHeure(vue.heure_fin)}` : ''}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{vue.cours_libelle}</span>
                {vue.type_libelle && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {vue.type_libelle}
                  </span>
                )}
              </span>

              <StatutSeanceBadge vue={vue} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
