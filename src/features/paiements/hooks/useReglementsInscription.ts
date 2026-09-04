import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { reglementKeys } from '@/features/paiements/hooks/useReglements'
import * as reglementRepo from '@/shared/supabase/reglementRepo'
import type { Reglement } from '@/shared/supabase/reglementRepo'

/**
 * Les règlements d'UNE inscription.
 *
 * ⚠️ Sert à annoncer ce qu'une désinscription va détruire. `reglement` cascade
 * depuis `inscription` (0026) : retirer un apprenant emporte tout ce qu'il a
 * versé. La migration pose que « l'interface DOIT annoncer ce qu'elle détruit
 * avant de le faire » — sans cette lecture, la promesse était vide.
 *
 * `enabled` sur l'identifiant : rien n'est chargé tant qu'aucune confirmation
 * n'est ouverte.
 */
export function useReglementsInscription(
  inscriptionId: string | null
): UseQueryResult<Reglement[], Error> {
  return useQuery({
    queryKey: [...reglementKeys.tous, 'inscription', inscriptionId ?? ''],
    queryFn: () => reglementRepo.listPourInscriptions([inscriptionId as string]),
    enabled: Boolean(inscriptionId),
  })
}
