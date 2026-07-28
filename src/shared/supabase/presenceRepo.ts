import { getSupabaseClient } from '@/shared/supabase/client'
import { lancerSiErreur } from '@/shared/supabase/erreurs'
import type { Apprenant } from '@/shared/supabase/apprenantRepo'
import type { Database } from '@/shared/supabase/types'

/**
 * Présence d'un apprenant à une séance (CLAUDE.md §4).
 * Utile surtout pour les cours en groupe ; `owner_id` est posé par la base.
 */
type TablePresence = Database['public']['Tables']['presence']
type Seance = Database['public']['Tables']['seance']['Row']

export type Presence = TablePresence['Row']

/** Présence accompagnée de l'apprenant concerné. */
export type PresenceAvecApprenant = Presence & {
  apprenant: Apprenant | null
}

/** Présence accompagnée de la séance — pour l'historique d'un apprenant. */
export type PresenceAvecSeance = Presence & {
  seance: Seance | null
}

export async function listBySeance(seanceId: string): Promise<PresenceAvecApprenant[]> {
  const { data, error } = await getSupabaseClient()
    .from('presence')
    .select('*, apprenant(*)')
    .eq('seance_id', seanceId)

  lancerSiErreur(error, 'Chargement des présences')

  return (data ?? []).sort((a, b) =>
    `${a.apprenant?.nom ?? ''} ${a.apprenant?.prenom ?? ''}`.localeCompare(
      `${b.apprenant?.nom ?? ''} ${b.apprenant?.prenom ?? ''}`,
      'fr'
    )
  )
}

/**
 * Fixe la présence d'un apprenant à une séance.
 * Idempotent : basculer présent/absent réécrit la même ligne.
 */
export async function definir(
  seanceId: string,
  apprenantId: string,
  present: boolean
): Promise<Presence> {
  const { data, error } = await getSupabaseClient()
    .from('presence')
    .upsert(
      { seance_id: seanceId, apprenant_id: apprenantId, present },
      { onConflict: 'seance_id,apprenant_id' }
    )
    .select('*')
    .single()

  lancerSiErreur(error, 'Enregistrement de la présence')

  return data
}

/** Historique de présence d'un apprenant, séance la plus récente en tête. */
export async function listByApprenant(apprenantId: string): Promise<PresenceAvecSeance[]> {
  const { data, error } = await getSupabaseClient()
    .from('presence')
    .select('*, seance(*)')
    .eq('apprenant_id', apprenantId)

  lancerSiErreur(error, "Chargement des présences de l'apprenant")

  return (data ?? []).sort((a, b) => (b.seance?.date ?? '').localeCompare(a.seance?.date ?? ''))
}

export async function remove(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from('presence').delete().eq('id', id)

  lancerSiErreur(error, 'Suppression de la présence')
}
