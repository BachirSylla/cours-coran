import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { creneauKeys } from '@/features/cours/hooks/coursKeys'
import * as creneauRepo from '@/shared/supabase/creneauRepo'
import type { CreneauExistant } from '@/features/cours/conflitsCours'
import type { JourSemaine } from '@/shared/lib/conflits'

/**
 * Tous les créneaux visibles, mis à plat pour la détection de conflit
 * (CLAUDE.md §5.1) et pour la grille hebdomadaire.
 *
 * Chacun porte l'enseignant affecté à son cours **et sa session** : le conflit
 * se scope sur cet agenda-là, et non sur le centre ni sur toute l'histoire.
 *
 * ⚠️ Un créneau dont le cours n'aurait pas remonté — embed nul — est écarté
 * plutôt que rangé sous une session inventée : mieux vaut ne pas le comparer que
 * le comparer contre le mauvais agenda.
 */
export function useTousLesCreneaux(): UseQueryResult<CreneauExistant[], Error> {
  return useQuery({
    queryKey: creneauKeys.liste(),
    queryFn: async () => {
      const creneaux = await creneauRepo.listAll()

      return creneaux.flatMap((creneau): CreneauExistant[] => {
        const session = creneau.cours?.session_id
        if (!session) return []

        return [
          {
            id: creneau.id,
            cours_id: creneau.cours_id,
            cours_libelle: creneau.cours?.libelle ?? 'Cours sans libellé',
            enseignant_id: creneau.cours?.enseignant_id ?? null,
            session_id: session,
            jour_semaine: creneau.jour_semaine as JourSemaine,
            heure_debut: creneau.heure_debut,
            heure_fin: creneau.heure_fin,
          },
        ]
      })
    },
  })
}
