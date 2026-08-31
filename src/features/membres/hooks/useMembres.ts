import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { membreKeys } from '@/features/membres/hooks/useMembre'
import * as membreRepo from '@/shared/supabase/membreRepo'
import type { Membre } from '@/shared/supabase/membreRepo'

/**
 * Les membres du centre, pour affecter un cours à l'un d'eux (migration 0014).
 *
 * La RLS ne laisse voir que son propre centre, et la clé étrangère composite
 * `(enseignant_id, centre_id)` refuse de toute façon une affectation en dehors :
 * cette liste ne fait que présenter les seules cibles possibles.
 *
 * Elle contient le responsable autant que les enseignants — un responsable
 * donne aussi des cours, et l'enseignant seul est précisément les deux à la
 * fois.
 */
export function useMembres(): UseQueryResult<Membre[], Error> {
  return useQuery({
    queryKey: [...membreKeys.tous, 'liste'],
    queryFn: () => membreRepo.list(),
    /*
     * Une minute, et pas une heure. Inviter quelqu'un est PRÉCISÉMENT ce qui
     * fait bouger cette liste — et le rachat du code invalide le cache du
     * nouveau venu, pas celui du responsable. Avec une heure, le sélecteur
     * d'enseignant restait invisible longtemps après l'arrivée du collègue.
     */
    staleTime: 60_000,
  })
}
