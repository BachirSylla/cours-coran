import { useMemo } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { useCours } from '@/features/cours/hooks/useCours'
import { paiementKeys } from '@/features/paiements/hooks/paiementKeys'
import {
  compterParStatut,
  fusionnerPaiements,
  genererMoisDus,
  moisCourant,
  totaliser,
  type LignePaiement,
  type StatutPaiement,
} from '@/shared/lib/paiements'
import { tarifDuCours } from '@/shared/supabase/coursRepo'
import * as paiementRepo from '@/shared/supabase/paiementRepo'
import type { Paiement } from '@/shared/supabase/paiementRepo'

/** Règlements enregistrés pour un mois donné. */
export function usePaiementsDuMois(mois: string): UseQueryResult<Paiement[], Error> {
  return useQuery({
    queryKey: paiementKeys.mois(mois),
    queryFn: () => paiementRepo.listParMois(mois),
  })
}

/** Une ligne du tableau, enrichie de ce qu'il faut pour l'afficher. */
export interface LigneMois extends LignePaiement<Paiement> {
  cours_libelle: string
  devise: string
}

export interface ResultatPaiementsMois {
  lignes: LigneMois[]
  totaux: { du: number; recu: number; reste: number }
  parStatut: Record<StatutPaiement, number>
  isPending: boolean
  isError: boolean
  error: Error | null
}

/**
 * Tableau de bord d'un mois (CLAUDE.md roadmap V2) : ce qui est dû, ce qui a
 * été encaissé, et ce qui reste — **en consultation seule**, sans relance (§5.5).
 *
 * Seuls les cours **actifs** sont facturés, comme pour les séances. Conséquence
 * à connaître : passer un cours en pause ou terminé le retire du tableau, même
 * pour un mois passé impayé. Pour clore un cours en gardant ses mois dus
 * visibles, renseigner `date_fin` plutôt que changer le statut.
 */
export function usePaiementsMois(mois: string): ResultatPaiementsMois {
  const requeteCours = useCours()
  const requetePaiements = usePaiementsDuMois(mois)

  const cours = requeteCours.data
  const paiements = requetePaiements.data

  const { lignes, totaux, parStatut } = useMemo(() => {
    if (!cours || !paiements) {
      return {
        lignes: [] as LigneMois[],
        totaux: { du: 0, recu: 0, reste: 0 },
        parStatut: { paye: 0, partiel: 0, attente: 0, retard: 0 } as Record<
          StatutPaiement,
          number
        >,
      }
    }

    const actifs = cours.filter((unCours) => unCours.statut === 'actif')
    const parCoursId = new Map(actifs.map((unCours) => [unCours.id, unCours]))

    // `genererMoisDus` produit tous les mois depuis date_debut : on ne retient
    // que celui affiché. Filtrer coûte moins cher que maintenir un second
    // chemin de calcul à côté de celui qui est déjà testé.
    const dus = actifs.flatMap((unCours) =>
      genererMoisDus(
        {
          id: unCours.id,
          // `tarif` est gardée responsable en lecture (0017) ; cette page l'est
          // aussi, donc l'embed est toujours présent ici.
          prix_mensuel: tarifDuCours(unCours)?.prix_mensuel ?? null,
          date_debut: unCours.date_debut,
          date_fin: unCours.date_fin,
        },
        mois
      ).filter((du) => du.mois === mois)
    )

    // Les règlements d'un cours non actif ne sont pas rattachés à un mois dû :
    // ils remonteraient en « hors période ». On ne les affiche pas ici — le
    // détail du cours, lui, les conserve.
    const pertinents = paiements.filter((paiement) => parCoursId.has(paiement.cours_id))

    // Le mois de référence des statuts est le mois RÉEL, pas celui affiché :
    // sinon consulter un mois passé le montrerait « en attente » au lieu
    // d'« en retard », et ce statut ne s'afficherait jamais nulle part.
    const fusion = fusionnerPaiements(dus, pertinents, moisCourant())

    const enrichies: LigneMois[] = fusion.map((ligne) => {
      const unCours = parCoursId.get(ligne.cours_id)

      return {
        ...ligne,
        cours_libelle: unCours?.libelle ?? 'Cours supprimé',
        devise: unCours ? (tarifDuCours(unCours)?.devise ?? 'XOF') : 'XOF',
      }
    })

    return {
      lignes: enrichies,
      totaux: totaliser(enrichies),
      parStatut: compterParStatut(enrichies),
    }
  }, [cours, paiements, mois])

  return {
    lignes,
    totaux,
    parStatut,
    isPending: requeteCours.isPending || requetePaiements.isPending,
    isError: requeteCours.isError || requetePaiements.isError,
    error: requeteCours.error ?? requetePaiements.error,
  }
}
