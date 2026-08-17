import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { coursPublicKeys } from '@/features/partage/hooks/partageKeys'
import * as coursPublicRepo from '@/shared/supabase/coursPublicRepo'
import type { CoursPublic } from '@/shared/supabase/coursPublicSchema'

/** Le cours partagé, ou `null` si le jeton ne correspond à rien. */
export function useCoursPublic(
  jeton: string | undefined
): UseQueryResult<CoursPublic | null, Error> {
  return useQuery({
    queryKey: coursPublicKeys.parJeton(jeton ?? ''),
    queryFn: () => coursPublicRepo.getParJeton(jeton as string),
    enabled: Boolean(jeton),
    // Un lien révoqué ne redeviendra pas valide en réessayant : une seule
    // tentative, et l'apprenant a sa réponse tout de suite.
    retry: false,
    staleTime: 5 * 60_000,
  })
}
