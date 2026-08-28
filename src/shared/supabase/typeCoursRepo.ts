import { getSupabaseClient } from '@/shared/supabase/client'
import { lancerSiErreur } from '@/shared/supabase/erreurs'
import type { Database } from '@/shared/supabase/types'

/**
 * Types de cours — table de **référence globale**, en lecture seule côté
 * application (CLAUDE.md §10 : ne jamais coder ces libellés en dur).
 * Elle n'a pas de `centre_id` : c'est une référence globale, que tout
 * utilisateur authentifié lit.
 */
export type TypeCours = Database['public']['Tables']['type_cours']['Row']

export async function list(): Promise<TypeCours[]> {
  const { data, error } = await getSupabaseClient()
    .from('type_cours')
    .select('*')
    .order('libelle', { ascending: true })

  lancerSiErreur(error, 'Chargement des types de cours')

  return data ?? []
}
