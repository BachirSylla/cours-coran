import { getSupabaseClient } from '@/shared/supabase/client'
import { lancerSiErreur } from '@/shared/supabase/erreurs'
import type { Database } from '@/shared/supabase/types'

/**
 * Règlements mensuels — couche repository (CLAUDE.md §3).
 *
 * Les mois dus ne sont pas pré-enregistrés : `upsert` crée la ligne au premier
 * règlement et la met à jour ensuite, sur la clé `(cours_id, mois_concerne)`.
 * Le **statut n'est pas une colonne** : il se calcule dans
 * `shared/lib/paiements.ts`. `centre_id` est posé par la base.
 */
type TablePaiement = Database['public']['Tables']['paiement']

export type Paiement = TablePaiement['Row']

export type PaiementInput = Omit<
  TablePaiement['Insert'],
  'id' | 'centre_id' | 'created_at' | 'updated_at'
>

const COLONNES = '*'

/** Règlements d'un mois donné (`AAAA-MM`) — base du tableau de bord. */
export async function listParMois(mois: string): Promise<Paiement[]> {
  const { data, error } = await getSupabaseClient()
    .from('paiement')
    .select(COLONNES)
    .eq('mois_concerne', mois)

  lancerSiErreur(error, 'Chargement des paiements du mois')

  return data ?? []
}

/** Tous les règlements d'un cours, du plus récent au plus ancien. */
export async function listParCours(coursId: string): Promise<Paiement[]> {
  const { data, error } = await getSupabaseClient()
    .from('paiement')
    .select(COLONNES)
    .eq('cours_id', coursId)
    .order('mois_concerne', { ascending: false })

  lancerSiErreur(error, 'Chargement des paiements du cours')

  return data ?? []
}

/** Règlements d'une plage de mois, bornes incluses. */
export async function listEntreMois(moisDebut: string, moisFin: string): Promise<Paiement[]> {
  const { data, error } = await getSupabaseClient()
    .from('paiement')
    .select(COLONNES)
    .gte('mois_concerne', moisDebut)
    .lte('mois_concerne', moisFin)
    .order('mois_concerne', { ascending: true })

  lancerSiErreur(error, 'Chargement des paiements')

  return data ?? []
}

/**
 * Enregistre un règlement — création la première fois, mise à jour ensuite.
 * Idempotent : deux saisies successives ne créent jamais de doublon.
 */
export async function upsert(input: PaiementInput): Promise<Paiement> {
  const { data, error } = await getSupabaseClient()
    .from('paiement')
    .upsert(input, { onConflict: 'cours_id,mois_concerne' })
    .select(COLONNES)
    .single()

  lancerSiErreur(error, 'Enregistrement du paiement')

  return data
}

export async function remove(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from('paiement').delete().eq('id', id)

  lancerSiErreur(error, 'Suppression du paiement')
}
