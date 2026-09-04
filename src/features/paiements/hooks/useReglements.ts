import { useMemo } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import { useParametres } from '@/features/parametres/hooks/useParametres'
import { useSessionActive } from '@/features/sessions/hooks/useSessions'
import {
  assemblerFacturation,
  dateLocale,
  MODE_FACTURATION_PAR_DEFAUT,
  type ContexteStatut,
  type InscriptionAffichable,
  type LigneAffichable,
  type ModeFacturation,
} from '@/shared/lib/facturation'
import { moisCourant, type StatutPaiement } from '@/shared/lib/paiements'
import * as reglementRepo from '@/shared/supabase/reglementRepo'
import type {
  InscriptionAFacturer,
  Reglement,
  ReglementInput,
} from '@/shared/supabase/reglementRepo'

/**
 * Clés de cache des règlements. Distinctes de `paiementKeys` : les deux grains
 * cohabitent, et invalider l'un ne doit pas recharger l'autre.
 */
export const reglementKeys = {
  tous: ['reglements'] as const,
  session: (sessionId: string) => [...reglementKeys.tous, 'session', sessionId] as const,
}

function useInscriptionsAFacturer(
  sessionId: string | undefined
): UseQueryResult<InscriptionAFacturer[], Error> {
  return useQuery({
    queryKey: [...reglementKeys.session(sessionId ?? ''), 'inscriptions'],
    queryFn: () => reglementRepo.listAFacturer(sessionId as string),
    enabled: Boolean(sessionId),
  })
}

function useReglementsEnregistres(
  sessionId: string | undefined,
  inscriptionIds: readonly string[]
): UseQueryResult<Reglement[], Error> {
  return useQuery({
    queryKey: [...reglementKeys.session(sessionId ?? ''), 'lignes', inscriptionIds.join(',')],
    queryFn: () => reglementRepo.listPourInscriptions(inscriptionIds),
    enabled: Boolean(sessionId),
  })
}

/** Une ligne du tableau, telle que l'écran la reçoit. */
export type LigneFacturation = LigneAffichable<Reglement>

export interface ResultatFacturation {
  mode: ModeFacturation
  lignes: LigneFacturation[]
  totaux: { du: number; recu: number; reste: number }
  parStatut: Record<StatutPaiement, number>
  /** Nom de la période affichée, pour l'en-tête. */
  session: { id: string; nom: string; date_fin: string | null } | null
  /**
   * Ce qui a été encaissé dans l'AUTRE mode et que cette page n'affiche pas.
   * Le taire ferait mentir la promesse « vos règlements restent modifiables ».
   */
  autreMode: { nombre: number; recu: number }
  isPending: boolean
  isError: boolean
  error: Error | null
}

function compterParStatut(lignes: readonly LigneFacturation[]): Record<StatutPaiement, number> {
  const compte: Record<StatutPaiement, number> = { paye: 0, partiel: 0, attente: 0, retard: 0 }
  for (const ligne of lignes) compte[ligne.statut] += 1

  return compte
}

/**
 * Le suivi des règlements de la session active, **nominatif** (migration 0026).
 *
 * En mode mensuel, `mois` désigne le mois affiché ; au forfait il est ignoré —
 * la période est la session, et il n'y en a qu'une.
 *
 * ⚠️ Le mois de référence des STATUTS est le mois RÉEL, jamais celui qu'on
 * consulte : sinon un mois passé s'afficherait « en attente » au lieu d'« en
 * retard », et ce statut ne se verrait jamais nulle part.
 *
 * Comme pour l'ancien tableau, seuls les cours **actifs** sont facturés. Pour
 * clore un cours en gardant ses périodes dues visibles, renseigner `date_fin`
 * plutôt que changer le statut.
 */
export function useReglements(mois: string): ResultatFacturation {
  const parametres = useParametres()
  const { session, erreur: erreurSession } = useSessionActive()

  const requeteInscriptions = useInscriptionsAFacturer(session?.id)
  const inscriptions = useMemo(
    () => requeteInscriptions.data ?? [],
    [requeteInscriptions.data]
  )
  const ids = useMemo(() => inscriptions.map((une) => une.id), [inscriptions])

  const requeteReglements = useReglementsEnregistres(session?.id, ids)

  const mode = parametres.data?.mode_facturation ?? MODE_FACTURATION_PAR_DEFAUT

  const { lignes, totaux, autreMode } = useMemo(() => {
    const vide = {
      lignes: [] as LigneAffichable<Reglement>[],
      totaux: { du: 0, recu: 0, reste: 0 },
      autreMode: { nombre: 0, recu: 0 },
    }

    if (requeteReglements.data === undefined) return vide

    /*
     * ⚠️ Seuls les cours ACTIFS sont facturés, comme avant 0026 et comme pour
     * les séances. Conséquence à connaître, inchangée : passer un cours en pause
     * ou en terminé le retire du tableau, même pour une période passée impayée.
     * Pour clore un cours en gardant ses périodes dues visibles, renseigner
     * `date_fin` plutôt que changer le statut.
     */
    const affichables: InscriptionAffichable[] = inscriptions
      .filter((une) => une.cours !== null && une.cours.statut === 'actif')
      .map((une) => {
        const tarif = une.cours!.tarif[0] ?? null

        return {
          id: une.id,
          apprenant_id: une.apprenant_id,
          cours_id: une.cours_id,
          // `created_at` est l'entrée dans CE cours : elle décale le premier
          // mois dû sans jamais proratiser.
          inscrit_le: une.created_at.slice(0, 10),
          cours_debut: une.cours!.date_debut,
          cours_fin: une.cours!.date_fin,
          session: une.cours!.session,
          prix_mensuel: tarif?.prix_mensuel ?? null,
          prix_session: tarif?.prix_session ?? null,
          apprenant: une.apprenant
            ? `${une.apprenant.prenom} ${une.apprenant.nom}`
            : 'Apprenant retiré',
          cours_libelle: une.cours!.libelle,
          devise: tarif?.devise ?? 'XOF',
        }
      })

    const contexte: ContexteStatut = {
      moisCourant: moisCourant(),
      // Date LOCALE, jamais `toISOString()` qui est UTC : `moisCourant()`
      // raisonne en heure locale, et mélanger les deux fait basculer un forfait
      // « en retard » un jour trop tôt ou trop tard selon le fuseau.
      aujourdHui: dateLocale(),
      finDeSession: new Map(
        affichables
          .map((une) => une.session)
          .filter((une): une is NonNullable<typeof une> => une !== null)
          .map((une) => [une.id, une.date_fin])
      ),
    }

    return assemblerFacturation(affichables, requeteReglements.data, mode, mois, contexte)
  }, [inscriptions, requeteReglements.data, mode, mois])

  const parStatut = useMemo(
    () => compterParStatut(lignes.filter((ligne) => !ligne.tarifManquant)),
    [lignes]
  )

  return {
    mode,
    lignes,
    totaux,
    parStatut,
    autreMode,
    session: session ?? null,
    isPending:
      parametres.isPending || requeteInscriptions.isPending || requeteReglements.isPending,
    isError: Boolean(erreurSession) || requeteInscriptions.isError || requeteReglements.isError,
    error: erreurSession ?? requeteInscriptions.error ?? requeteReglements.error,
  }
}

/** Enregistre le règlement d'une période, et rafraîchit le tableau. */
export function useEnregistrerReglement(): UseMutationResult<Reglement, Error, ReglementInput> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: reglementRepo.enregistrer,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reglementKeys.tous })
    },
  })
}
