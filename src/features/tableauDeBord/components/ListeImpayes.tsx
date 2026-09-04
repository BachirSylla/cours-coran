import { Link } from 'react-router'
import { Wallet } from 'lucide-react'

import { StatutPaiementBadge } from '@/features/paiements/components/StatutPaiementBadge'
import { formaterMontant } from '@/shared/lib/paiements'
import type { Impaye } from '@/shared/lib/tableauDeBord'
import { Button } from '@/shared/ui/button'

export interface ListeImpayesProps {
  impayes: Impaye[]
  /** Au-delà, on renvoie vers l'écran complet plutôt que d'allonger la carte. */
  limite?: number
}

/** Initiales, pour donner un point d'ancrage visuel à chaque ligne. */
function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .slice(0, 2)
    .map((mot) => mot.charAt(0).toUpperCase())
    .join('')
}

/**
 * Qui n'a pas payé — **nominatif**, ce que le grain `(inscription, période)`
 * rend possible depuis 0026. Avant, cette carte n'aurait affiché qu'un total.
 *
 * Le montant qui compte est le **reste**, pas le dû : c'est ce qu'il faut aller
 * chercher. Le dû complet se lit dans la page Paiements.
 */
export function ListeImpayes({ impayes, limite = 6 }: ListeImpayesProps) {
  if (impayes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center">
        <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Wallet className="size-4" aria-hidden="true" />
        </span>
        <p className="text-sm font-medium">Tout est réglé</p>
        <p className="text-xs text-muted-foreground">
          Personne n'a de reste à payer sur cette période.
        </p>
      </div>
    )
  }

  const visibles = impayes.slice(0, limite)
  const restants = impayes.length - visibles.length

  /*
   * Des PERSONNES, pas des lignes : quelqu'un inscrit à deux cours apparaît deux
   * fois dans la liste — c'est juste, ce sont deux sommes à encaisser — mais
   * l'annoncer comme deux personnes gonflerait le chiffre sur l'écran qui sert à
   * relancer.
   */
  const personnes = new Set(impayes.map((impaye) => impaye.apprenant_id)).size

  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-lg border">
        {visibles.map((impaye) => (
          <li
            key={impaye.inscription_id}
            className="flex items-center gap-3 px-3 py-2.5"
          >
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
            >
              {initiales(impaye.apprenant)}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{impaye.apprenant}</p>
              <p className="truncate text-xs text-muted-foreground">
                {impaye.cours_libelle} · {impaye.periode}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold tabular-nums">
                {formaterMontant(impaye.reste, impaye.devise)}
              </p>
              <StatutPaiementBadge statut={impaye.statut} />
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {restants > 0
            ? `et ${restants} autre${restants > 1 ? 's' : ''}`
            : `${personnes} personne${personnes > 1 ? 's' : ''} · ${impayes.length} règlement${impayes.length > 1 ? 's' : ''}`}
        </p>
        <Button asChild variant="ghost" size="sm">
          <Link to="/paiements">Ouvrir les paiements</Link>
        </Button>
      </div>
    </div>
  )
}
