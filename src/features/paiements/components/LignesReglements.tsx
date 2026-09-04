import { StatutPaiementBadge } from '@/features/paiements/components/StatutPaiementBadge'
import type { LigneFacturation } from '@/features/paiements/hooks/useReglements'
import { formaterMontant } from '@/shared/lib/paiements'
import { Button } from '@/shared/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'

export interface LignesReglementsProps {
  lignes: LigneFacturation[]
  /**
   * Ferme la saisie sur toutes les lignes — quand la base la refuserait de toute
   * façon (forfait sur une session sans date de fin, P0080).
   */
  saisieFermee?: boolean
  onEnregistrer: (ligne: LigneFacturation) => void
}

/**
 * Lignes de règlement, **une par personne** — composant présentational pur.
 *
 * C'est ce que le grain `(inscription, période)` rend possible : dans un groupe
 * de huit, huit lignes nominatives au lieu d'un total dont personne ne savait
 * qui l'avait versé.
 */
export function LignesReglements({
  lignes,
  saisieFermee = false,
  onEnregistrer,
}: LignesReglementsProps) {
  return (
    <>
      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Apprenant</TableHead>
              <TableHead>Cours</TableHead>
              <TableHead className="text-right">Dû</TableHead>
              <TableHead className="text-right">Reçu</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="w-32 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lignes.map((ligne) => (
              <TableRow key={`${ligne.inscription_id}-${ligne.mois ?? ligne.session_id}`}>
                <TableCell className="font-medium">{ligne.apprenant}</TableCell>
                <TableCell className="text-muted-foreground">{ligne.cours_libelle}</TableCell>

                {ligne.tarifManquant ? (
                  <TableCell colSpan={3} className="text-sm text-muted-foreground">
                    Aucun tarif saisi pour ce mode
                  </TableCell>
                ) : (
                  <>
                    <TableCell className="text-right tabular-nums">
                      {formaterMontant(ligne.montant_du, ligne.devise)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formaterMontant(ligne.montant_recu, ligne.devise)}
                    </TableCell>
                    <TableCell>
                      <StatutPaiementBadge statut={ligne.statut} />
                    </TableCell>
                  </>
                )}

                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={ligne.tarifManquant || saisieFermee}
                    onClick={() => onEnregistrer(ligne)}
                    aria-label={`Enregistrer un règlement pour ${ligne.apprenant}`}
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
          <li
            key={`${ligne.inscription_id}-${ligne.mois ?? ligne.session_id}`}
            className="rounded-lg border bg-card p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{ligne.apprenant}</p>
                <p className="truncate text-xs text-muted-foreground">{ligne.cours_libelle}</p>
              </div>
              {!ligne.tarifManquant && <StatutPaiementBadge statut={ligne.statut} />}
            </div>

            {ligne.tarifManquant ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Aucun tarif saisi pour ce mode.
              </p>
            ) : (
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
            )}

            <div className="mt-3 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                disabled={ligne.tarifManquant || saisieFermee}
                onClick={() => onEnregistrer(ligne)}
                aria-label={`Enregistrer un règlement pour ${ligne.apprenant}`}
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
