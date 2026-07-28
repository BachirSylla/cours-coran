import { formaterMontant } from '@/shared/lib/paiements'

export interface TotauxMoisProps {
  du: number
  recu: number
  reste: number
  devise: string
}

function Total({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <dt className="text-xs text-muted-foreground">{libelle}</dt>
      <dd className="text-lg font-semibold tabular-nums">{valeur}</dd>
    </div>
  )
}

/**
 * Rangée de synthèse — trois chiffres, sans exclamation ni icône d'alerte.
 * La partie financière se consulte, elle ne réclame pas (CLAUDE.md §5.5).
 */
export function TotauxMois({ du, recu, reste, devise }: TotauxMoisProps) {
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Total libelle="Attendu" valeur={formaterMontant(du, devise)} />
      <Total libelle="Encaissé" valeur={formaterMontant(recu, devise)} />
      <Total libelle="Reste dû" valeur={formaterMontant(reste, devise)} />
    </dl>
  )
}
