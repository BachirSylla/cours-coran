import { StatutPaiementBadge } from '@/features/paiements/components/StatutPaiementBadge'
import type { LigneMois } from '@/features/paiements/hooks/usePaiementsMois'
import { formaterMontant } from '@/shared/lib/paiements'
import { Button } from '@/shared/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table'

export interface LignesPaiementsProps {
  lignes: LigneMois[]
  onEnregistrer: (ligne: LigneMois) => void
}

/** Lignes du mois — composant présentational pur. */
export function LignesPaiements({ lignes, onEnregistrer }: LignesPaiementsProps) {
  return (
    <>
      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cours</TableHead>
              <TableHead className="text-right">Dû</TableHead>
              <TableHead className="text-right">Reçu</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="w-32 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lignes.map((ligne) => (
              <TableRow key={`${ligne.cours_id}-${ligne.mois}`}>
                <TableCell className="font-medium">{ligne.cours_libelle}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formaterMontant(ligne.montant_du, ligne.devise)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formaterMontant(ligne.montant_recu, ligne.devise)}
                </TableCell>
                <TableCell>
                  <StatutPaiementBadge statut={ligne.statut} />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEnregistrer(ligne)}
                    aria-label={`Enregistrer un règlement pour ${ligne.cours_libelle}`}
                  >
                    Enregistrer
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="space-y-3 md:hidden">
        {lignes.map((ligne) => (
          <li key={`${ligne.cours_id}-${ligne.mois}`} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 flex-1 truncate font-medium">{ligne.cours_libelle}</p>
              <StatutPaiementBadge statut={ligne.statut} />
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div>
                <dt>Dû</dt>
                <dd className="text-foreground tabular-nums">
                  {formaterMontant(ligne.montant_du, ligne.devise)}
                </dd>
              </div>
              <div>
                <dt>Reçu</dt>
                <dd className="text-foreground tabular-nums">
                  {formaterMontant(ligne.montant_recu, ligne.devise)}
                </dd>
              </div>
            </dl>

            <div className="mt-3 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEnregistrer(ligne)}
                aria-label={`Enregistrer un règlement pour ${ligne.cours_libelle}`}
              >
                Enregistrer
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
