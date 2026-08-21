import { estPresent, type EtatPresence } from '@/shared/lib/rapport'
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

/**
 * Présence accompagnée de sa séance **et du libellé du cours** — c'est ce qui
 * permet de regrouper les évaluations d'un apprenant par cours sur sa fiche.
 */
export type PresenceAvecSeance = Presence & {
  seance: (Seance & { cours: { libelle: string } | null }) | null
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
 *
 * `etat` est écrit en même temps. Sans cela, cocher « présent » sur une ligne
 * déjà marquée `absent` laisserait les deux colonnes se contredire, et c'est
 * `etat` qui l'emporte dans le comptage — la case à cocher paraîtrait sans
 * effet. Les deux colonnes ne s'écrivent jamais l'une sans l'autre.
 */
export async function definir(
  seanceId: string,
  apprenantId: string,
  present: boolean
): Promise<Presence> {
  return ecrirePresence(seanceId, apprenantId, present ? 'present' : 'absent')
}

/**
 * Fixe l'état nuancé de présence (migration 0008), et le booléen qui en découle.
 *
 * La classification vient de `estPresent` : elle vit dans `shared/lib/rapport.ts`
 * et nulle part ailleurs, de sorte qu'écriture et comptage ne peuvent pas
 * diverger.
 */
export function definirEtat(
  seanceId: string,
  apprenantId: string,
  etat: EtatPresence
): Promise<Presence> {
  return ecrirePresence(seanceId, apprenantId, etat)
}

async function ecrirePresence(
  seanceId: string,
  apprenantId: string,
  etat: EtatPresence
): Promise<Presence> {
  const { data, error } = await getSupabaseClient()
    .from('presence')
    .upsert(
      { seance_id: seanceId, apprenant_id: apprenantId, etat, present: estPresent(etat) },
      { onConflict: 'seance_id,apprenant_id' }
    )
    .select('*')
    .single()

  lancerSiErreur(error, 'Enregistrement de la présence')

  return data
}

/** Champs d'évaluation d'une récitation. Tous facultatifs. */
export interface EvaluationInput {
  note?: number | null
  note_bareme?: number | null
  commentaire?: string | null
  passage_evalue?: string | null
}

/**
 * Enregistre l'évaluation d'un apprenant sur une séance.
 *
 * `present` n'est **pas** dans la charge utile : PostgREST ne met à jour que les
 * colonnes envoyées, donc noter quelqu'un ne réécrit pas sa présence — un
 * apprenant marqué absent le reste (vérifié contre la base réelle). À la
 * création, la colonne prend son défaut, `true`.
 */
export async function noter(
  seanceId: string,
  apprenantId: string,
  evaluation: EvaluationInput
): Promise<Presence> {
  const { data, error } = await getSupabaseClient()
    .from('presence')
    .upsert(
      { seance_id: seanceId, apprenant_id: apprenantId, ...evaluation },
      { onConflict: 'seance_id,apprenant_id' }
    )
    .select('*')
    .single()

  lancerSiErreur(error, "Enregistrement de l'évaluation")

  return data
}

/** Historique de présence d'un apprenant, séance la plus récente en tête. */
export async function listByApprenant(apprenantId: string): Promise<PresenceAvecSeance[]> {
  const { data, error } = await getSupabaseClient()
    .from('presence')
    .select('*, seance(*, cours(libelle))')
    .eq('apprenant_id', apprenantId)

  lancerSiErreur(error, "Chargement des présences de l'apprenant")

  return (data ?? []).sort((a, b) => (b.seance?.date ?? '').localeCompare(a.seance?.date ?? ''))
}

export async function remove(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from('presence').delete().eq('id', id)

  lancerSiErreur(error, 'Suppression de la présence')
}
