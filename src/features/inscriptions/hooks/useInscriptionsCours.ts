import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { inscriptionKeys } from '@/features/inscriptions/hooks/inscriptionKeys'
import * as inscriptionRepo from '@/shared/supabase/inscriptionRepo'
import type { InscriptionAvecApprenant } from '@/shared/supabase/inscriptionRepo'

/** Apprenants inscrits à un cours. Inactive tant que `coursId` est absent. */
export function useInscriptionsCours(
  coursId: string | undefined
): UseQueryResult<InscriptionAvecApprenant[], Error> {
  return useQuery({
    queryKey: inscriptionKeys.parCours(coursId ?? ''),
    queryFn: () => inscriptionRepo.listByCours(coursId as string),
    enabled: Boolean(coursId),
  })
}

/**
 * Les apprenants inscrits au cours dont celui-ci est la **copie** (migration
 * 0024).
 *
 * ⚠️ Une aide à la saisie, jamais une recopie. La reconduction ne reprend
 * délibérément aucune inscription : promouvoir quelqu'un de Niveau 1 à Niveau 2
 * — ou constater qu'il ne se réinscrit pas — doit rester un choix. Ce hook ne
 * fait que rappeler qui était là.
 *
 * Désactivé quand le cours n'est pas issu d'une reconduction : il n'y a alors
 * rien à proposer, et une requête de plus ne servirait à rien.
 */
export function useInscriptionsSessionPrecedente(
  coursSourceId: string | null | undefined
): UseQueryResult<InscriptionAvecApprenant[], Error> {
  return useQuery({
    queryKey: inscriptionKeys.parCours(coursSourceId ?? ''),
    queryFn: () => inscriptionRepo.listByCours(coursSourceId as string),
    enabled: Boolean(coursSourceId),
    staleTime: 5 * 60_000,
  })
}
