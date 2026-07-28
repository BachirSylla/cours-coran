import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { presenceKeys } from '@/features/seances/hooks/seanceKeys'
import * as presenceRepo from '@/shared/supabase/presenceRepo'
import type { PresenceAvecSeance } from '@/shared/supabase/presenceRepo'

/** Historique de présence d'un apprenant, toutes séances confondues. */
export function usePresencesApprenant(
  apprenantId: string | undefined
): UseQueryResult<PresenceAvecSeance[], Error> {
  return useQuery({
    queryKey: presenceKeys.parApprenant(apprenantId ?? ''),
    queryFn: () => presenceRepo.listByApprenant(apprenantId as string),
    enabled: Boolean(apprenantId),
  })
}
