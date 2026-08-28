import { getSupabaseClient } from '@/shared/supabase/client'
import { lancerSiErreur } from '@/shared/supabase/erreurs'
import type { Database } from '@/shared/supabase/types'

/**
 * Accès aux apprenants — couche repository (CLAUDE.md §3).
 * Aucun composant ni hook de feature n'appelle Supabase directement.
 *
 * `centre_id` n'est **jamais** posé ici : la base l'affecte via
 * `default centre_courant()`, et les policies RLS le vérifient (migration 0012).
 */
type TableApprenant = Database['public']['Tables']['apprenant']

export type Apprenant = TableApprenant['Row']

/** Champs modifiables par l'utilisateur (le reste est géré par la base). */
export type ApprenantInput = Omit<
  TableApprenant['Insert'],
  'id' | 'owner_id' | 'centre_id' | 'created_at' | 'updated_at'
>

export type ApprenantPatch = Partial<ApprenantInput>

const COLONNES = '*'

/** Tous les apprenants du propriétaire, triés par nom puis prénom. */
export async function list(): Promise<Apprenant[]> {
  const { data, error } = await getSupabaseClient()
    .from('apprenant')
    .select(COLONNES)
    .order('nom', { ascending: true })
    .order('prenom', { ascending: true })

  lancerSiErreur(error, 'Chargement des apprenants')

  return data ?? []
}

/** Un apprenant, ou `null` s'il n'existe pas (ou n'appartient pas à l'utilisateur). */
export async function getById(id: string): Promise<Apprenant | null> {
  const { data, error } = await getSupabaseClient()
    .from('apprenant')
    .select(COLONNES)
    .eq('id', id)
    .maybeSingle()

  lancerSiErreur(error, "Chargement de l'apprenant")

  return data
}

export async function create(input: ApprenantInput): Promise<Apprenant> {
  const { data, error } = await getSupabaseClient()
    .from('apprenant')
    .insert(input)
    .select(COLONNES)
    .single()

  lancerSiErreur(error, "Création de l'apprenant")

  return data
}

export async function update(id: string, patch: ApprenantPatch): Promise<Apprenant> {
  const { data, error } = await getSupabaseClient()
    .from('apprenant')
    .update(patch)
    .eq('id', id)
    .select(COLONNES)
    .single()

  lancerSiErreur(error, "Modification de l'apprenant")

  return data
}

export async function remove(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from('apprenant').delete().eq('id', id)

  lancerSiErreur(error, "Suppression de l'apprenant")
}
