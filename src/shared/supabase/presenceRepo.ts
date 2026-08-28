import { estPresent, type EtatPresence } from '@/shared/lib/rapport'
import { getSupabaseClient } from '@/shared/supabase/client'
import { lancerSiErreur } from '@/shared/supabase/erreurs'
import type { Apprenant } from '@/shared/supabase/apprenantRepo'
import type { Database } from '@/shared/supabase/types'

/**
 * Présence d'un apprenant à une séance (CLAUDE.md §4).
 * Utile surtout pour les cours en groupe ; `centre_id` est posé par la base.
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

/**
 * `presence.cours_id` (migration 0012) est **posé par la base**, via le trigger
 * `presence_hydrater_cours` : le client ne l'envoie pas, et ne peut donc pas
 * mentir sur le cours auquel une présence se rattache — c'est ce qui fait tenir
 * la policy de la table. La colonne étant `not null`, les types générés la
 * déclarent pourtant obligatoire à l'insertion. D'où cette conversion, le seul
 * endroit du code où elle est admise.
 */
const laBasePoseLeCours = (charge: Omit<TablePresence['Insert'], 'cours_id'>) =>
  charge as TablePresence['Insert']

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
 * Fixe l'état de présence d'un apprenant à une séance (migration 0008).
 * Idempotent : repointer quelqu'un réécrit la même ligne.
 *
 * Le booléen `present` est écrit **en même temps**, dérivé de l'état par
 * `estPresent`. Sans cela les deux colonnes se contrediraient tôt ou tard, et
 * c'est l'état qui l'emporte dans le comptage — la case à cocher paraîtrait
 * sans effet. La classification vit dans `shared/lib/rapport.ts` et nulle part
 * ailleurs, de sorte qu'écriture et comptage ne peuvent pas diverger.
 */
export async function definirEtat(
  seanceId: string,
  apprenantId: string,
  etat: EtatPresence
): Promise<Presence> {
  const { data, error } = await getSupabaseClient()
    .from('presence')
    .upsert(
      laBasePoseLeCours({
        seance_id: seanceId,
        apprenant_id: apprenantId,
        etat,
        present: estPresent(etat),
      }),
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
      laBasePoseLeCours({ seance_id: seanceId, apprenant_id: apprenantId, ...evaluation }),
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
