import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { presenceKeys } from '@/features/seances/hooks/seanceKeys'
import * as presenceRepo from '@/shared/supabase/presenceRepo'
import type { PresenceAvecApprenant } from '@/shared/supabase/presenceRepo'

/** Présences d'une séance. Inactive tant que la séance n'existe pas. */
export function usePresences(
  seanceId: string | undefined
): UseQueryResult<PresenceAvecApprenant[], Error> {
  return useQuery({
    queryKey: presenceKeys.parSeance(seanceId ?? ''),
    queryFn: () => presenceRepo.listBySeance(seanceId as string),
    enabled: Boolean(seanceId),
  })
}
