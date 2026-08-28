import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { invitationKeys } from '@/features/membres/hooks/invitationKeys'
import * as invitationRepo from '@/shared/supabase/invitationRepo'
import type { Invitation } from '@/shared/supabase/invitationRepo'

/**
 * Les invitations du centre. La RLS ne les montre qu'au responsable : pour
 * quelqu'un d'autre, la liste revient vide plutôt qu'en erreur.
 */
export function useInvitations(actif = true): UseQueryResult<Invitation[], Error> {
  return useQuery({
    queryKey: invitationKeys.tous,
    queryFn: () => invitationRepo.list(),
    enabled: actif,
  })
}
