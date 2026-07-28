import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { seanceKeys } from '@/features/seances/hooks/seanceKeys'
import * as seanceRepo from '@/shared/supabase/seanceRepo'
import type { Seance } from '@/shared/supabase/seanceRepo'

/** Séances enregistrées d'un cours, les plus récentes en tête. */
export function useSeancesCours(coursId: string | undefined): UseQueryResult<Seance[], Error> {
  return useQuery({
    queryKey: seanceKeys.parCours(coursId ?? ''),
    queryFn: () => seanceRepo.listByCours(coursId as string),
    enabled: Boolean(coursId),
  })
}
