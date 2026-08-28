import { getSupabaseClient } from '@/shared/supabase/client'
import { ErreurSupabase, lancerSiErreur } from '@/shared/supabase/erreurs'
import type { Apprenant } from '@/shared/supabase/apprenantRepo'
import type { Database } from '@/shared/supabase/types'

/**
 * Liaison apprenant ↔ cours — couche repository (CLAUDE.md §3).
 *
 * La capacité d'un cours (individuel = 1, groupe = 1..N) n'est **pas** vérifiée
 * ici : c'est une règle applicative tenue par
 * `features/inscriptions/reglesInscription.ts` (CLAUDE.md §5.7).
 * `centre_id` est posé par la base via `default centre_courant()`.
 */
type TableInscription = Database['public']['Tables']['inscription']

export type Inscription = TableInscription['Row']
type Cours = Database['public']['Tables']['cours']['Row']
type Creneau = Database['public']['Tables']['creneau']['Row']

/** Inscription vue depuis un cours : qui est inscrit. */
export type InscriptionAvecApprenant = Inscription & {
  apprenant: Apprenant | null
}

/** Inscription vue depuis un apprenant : à quoi il est inscrit. */
export type InscriptionAvecCours = Inscription & {
  cours: (Cours & { type_cours: { libelle: string } | null; creneau: Creneau[] }) | null
}

export async function listByCours(coursId: string): Promise<InscriptionAvecApprenant[]> {
  const { data, error } = await getSupabaseClient()
    .from('inscription')
    .select('*, apprenant(*)')
    .eq('cours_id', coursId)

  lancerSiErreur(error, 'Chargement des apprenants du cours')

  return (data ?? []).sort((a, b) =>
    `${a.apprenant?.nom ?? ''} ${a.apprenant?.prenom ?? ''}`.localeCompare(
      `${b.apprenant?.nom ?? ''} ${b.apprenant?.prenom ?? ''}`,
      'fr'
    )
  )
}

export async function listByApprenant(apprenantId: string): Promise<InscriptionAvecCours[]> {
  const { data, error } = await getSupabaseClient()
    .from('inscription')
    .select('*, cours(*, type_cours(libelle), creneau(*))')
    .eq('apprenant_id', apprenantId)

  lancerSiErreur(error, "Chargement des cours de l'apprenant")

  return (data ?? []).sort((a, b) =>
    (a.cours?.libelle ?? '').localeCompare(b.cours?.libelle ?? '', 'fr')
  )
}

export async function ajouter(apprenantId: string, coursId: string): Promise<Inscription> {
  const { data, error } = await getSupabaseClient()
    .from('inscription')
    .insert({ apprenant_id: apprenantId, cours_id: coursId })
    .select('*')
    .single()

  // La contrainte unique (apprenant_id, cours_id) mérite un message précis.
  if (error?.code === '23505') {
    throw new ErreurSupabase('Cet apprenant est déjà inscrit à ce cours.', error)
  }
  lancerSiErreur(error, "Inscription de l'apprenant")

  return data
}

/** Note d'examen de fin de session. Les deux champs vont ensemble. */
export interface ExamenInput {
  note_examen: number | null
  examen_bareme: number | null
}

/**
 * Enregistre la note d'examen d'un apprenant pour un cours (migration 0008).
 *
 * Le barème accompagne la note, comme pour les récitations : changer de réglage
 * plus tard ne doit pas réinterpréter une note déjà donnée. La base refuse
 * d'ailleurs une note sans son barème (`inscription_note_examen_coherente`).
 *
 * Effacer une note se fait en passant les deux champs à `null`.
 */
export async function noterExamen(
  inscriptionId: string,
  examen: ExamenInput
): Promise<Inscription> {
  const { data, error } = await getSupabaseClient()
    .from('inscription')
    .update(examen)
    .eq('id', inscriptionId)
    .select('*')
    .single()

  lancerSiErreur(error, "Enregistrement de la note d'examen")

  return data
}

/** Retire l'apprenant du cours — **et supprime sa note d'examen avec la ligne**. */
export async function retirer(inscriptionId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('inscription')
    .delete()
    .eq('id', inscriptionId)

  lancerSiErreur(error, "Retrait de l'apprenant")
}
