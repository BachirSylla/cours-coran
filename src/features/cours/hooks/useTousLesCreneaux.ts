import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { creneauKeys } from '@/features/cours/hooks/coursKeys'
import * as creneauRepo from '@/shared/supabase/creneauRepo'
import type { CreneauExistant } from '@/features/cours/conflitsCours'
import type { JourSemaine } from '@/shared/lib/conflits'

/**
 * Tous les créneaux du propriétaire, mis à plat pour la détection de conflit
 * (CLAUDE.md §5.1) et, plus tard, pour la grille hebdomadaire.
 */
export function useTousLesCreneaux(): UseQueryResult<CreneauExistant[], Error> {
  return useQuery({
    queryKey: creneauKeys.liste(),
    queryFn: async () => {
      const creneaux = await creneauRepo.listAll()

      return creneaux.map((creneau): CreneauExistant => ({
        id: creneau.id,
        cours_id: creneau.cours_id,
        cours_libelle: creneau.cours?.libelle ?? 'Cours sans libellé',
        jour_semaine: creneau.jour_semaine as JourSemaine,
        heure_debut: creneau.heure_debut,
        heure_fin: creneau.heure_fin,
      }))
    },
  })
}
