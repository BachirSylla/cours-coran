import { useMemo } from 'react'

import { useCours } from '@/features/cours/hooks/useCours'
import { useSessionActive } from '@/features/sessions/hooks/useSessions'
import {
  estPorteeFacturation,
  PORTEE_PAR_DEFAUT,
  type CoursFacturable,
} from '@/shared/lib/facturation'
import { tarifDuCours } from '@/shared/supabase/coursRepo'

/**
 * Les cours actifs réglés **en bloc par la classe** (migration 0027).
 *
 * ⚠️ Ils viennent des COURS, jamais des inscriptions. Un forfait de classe est
 * dû quel que soit le nombre d'apprenants — même zéro : c'est un engagement du
 * cours, pas la somme de places individuelles. Les déduire des inscriptions
 * ferait disparaître de la facturation exactement les classes qu'on vient
 * d'ouvrir, sans que rien ne le signale.
 *
 * La liste est vide pour un enseignant : `tarif` est fermée en lecture (0017),
 * donc la portée lui revient au défaut `par_apprenant`. Il ne voit de toute
 * façon aucun règlement.
 */
export interface ResultatCoursAuForfait {
  cours: CoursFacturable[]
  /**
   * ⚠️ Remontés à l'appelant. Sans eux, l'échec de `useCours` faisait disparaître
   * en silence les classes SANS inscrit — celles que ce hook est justement seul
   * à apporter — et l'écran affirmait un total faux au lieu de se taire.
   */
  isPending: boolean
  isError: boolean
  error: Error | null
}

export function useCoursAuForfait(): ResultatCoursAuForfait {
  const { data: cours, isPending, isError, error } = useCours()
  const { session } = useSessionActive()

  const liste = useMemo(() => {
    return (cours ?? [])
      .filter((unCours) => unCours.statut === 'actif')
      .filter((unCours) => {
        const tarif = tarifDuCours(unCours)
        const portee =
          tarif !== null && estPorteeFacturation(tarif.portee_facturation)
            ? tarif.portee_facturation
            : PORTEE_PAR_DEFAUT

        return portee === 'forfait_classe'
      })
      .map((unCours) => {
        const tarif = tarifDuCours(unCours)

        return {
          id: unCours.id,
          libelle: unCours.libelle,
          cours_debut: unCours.date_debut,
          cours_fin: unCours.date_fin,
          /*
           * ⚠️ La session ACTIVE, et non `null` : `useCours` ne rend que les
           * cours de cette session, et sans elle le mode « forfait par session »
           * ne produirait aucune période — la classe ne devrait plus rien.
           */
          session: session
            ? { id: session.id, date_debut: session.date_debut, date_fin: session.date_fin }
            : null,
          prix_mensuel: tarif?.prix_mensuel ?? null,
          prix_session: tarif?.prix_session ?? null,
          devise: tarif?.devise ?? 'XOF',
        }
      })
  }, [cours, session])

  return { cours: liste, isPending, isError, error }
}
