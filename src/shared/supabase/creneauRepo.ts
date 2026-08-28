import { getSupabaseClient } from '@/shared/supabase/client'
import { lancerSiErreur } from '@/shared/supabase/erreurs'
import type { Database } from '@/shared/supabase/types'

/**
 * Accès aux créneaux hebdomadaires — couche repository (CLAUDE.md §3).
 *
 * L'écriture cours + créneaux passe normalement par `coursRepo` (transaction
 * atomique). Les fonctions d'écriture ci-dessous servent aux manipulations
 * unitaires de la future grille (déplacement d'un créneau, par exemple).
 */
type TableCreneau = Database['public']['Tables']['creneau']

export type Creneau = TableCreneau['Row']

export type CreneauInput = Omit<
  TableCreneau['Insert'],
  'id' | 'owner_id' | 'centre_id' | 'created_at' | 'updated_at'
>

/** Créneau enrichi du libellé de son cours — base de la détection de conflit. */
export type CreneauAvecCours = Creneau & {
  cours: { libelle: string } | null
}

export async function listByCours(coursId: string): Promise<Creneau[]> {
  const { data, error } = await getSupabaseClient()
    .from('creneau')
    .select('*')
    .eq('cours_id', coursId)
    .order('jour_semaine', { ascending: true })
    .order('heure_debut', { ascending: true })

  lancerSiErreur(error, 'Chargement des créneaux du cours')

  return data ?? []
}

/**
 * Tous les créneaux du propriétaire, tous cours confondus.
 * C'est l'ensemble contre lequel se fait la détection de conflit (CLAUDE.md §5.1).
 */
export async function listAll(): Promise<CreneauAvecCours[]> {
  const { data, error } = await getSupabaseClient()
    .from('creneau')
    .select('*, cours(libelle)')
    .order('jour_semaine', { ascending: true })
    .order('heure_debut', { ascending: true })

  lancerSiErreur(error, 'Chargement des créneaux')

  return data ?? []
}

export async function create(input: CreneauInput): Promise<Creneau> {
  const { data, error } = await getSupabaseClient()
    .from('creneau')
    .insert(input)
    .select('*')
    .single()

  lancerSiErreur(error, 'Création du créneau')

  return data
}

export async function update(id: string, patch: Partial<CreneauInput>): Promise<Creneau> {
  const { data, error } = await getSupabaseClient()
    .from('creneau')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  lancerSiErreur(error, 'Modification du créneau')

  return data
}

export async function remove(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from('creneau').delete().eq('id', id)

  lancerSiErreur(error, 'Suppression du créneau')
}
