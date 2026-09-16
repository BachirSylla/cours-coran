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
  'id' | 'centre_id' | 'created_at' | 'updated_at'
>

export type ApprenantPatch = Partial<ApprenantInput>

const COLONNES = '*'

/** Tous les apprenants du propriétaire, triés par nom puis prénom. */
/** Sous le `max_rows` de PostgREST (1000). */
const PAGE = 1000

/**
 * Tous les apprenants lisibles, par nom puis prénom.
 *
 * ⚠️ PAGINÉ. La page Apprenants cherche et pagine CÔTÉ ÉCRAN, sur ce que cette
 * fonction rend : si PostgREST coupait à `max_rows` — ce qu'il fait **en
 * silence** — la recherche répondrait « aucun apprenant ne correspond » pour
 * une personne bien présente en base, et le total annoncé serait faux.
 *
 * L'`id` départage les homonymes : sans ordre total, deux pages successives
 * pourraient se recouvrir ou se trouer.
 */
export async function list(): Promise<Apprenant[]> {
  const client = getSupabaseClient()
  const tous: Apprenant[] = []
  let debut = 0

  for (;;) {
    const { data, error } = await client
      .from('apprenant')
      .select(COLONNES)
      .order('nom', { ascending: true })
      .order('prenom', { ascending: true })
      .order('id', { ascending: true })
      .range(debut, debut + PAGE - 1)

    lancerSiErreur(error, 'Chargement des apprenants')

    const page = data ?? []
    tous.push(...page)

    if (page.length < PAGE) return tous

    debut += PAGE
  }
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
