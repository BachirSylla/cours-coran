import { getSupabaseClient } from '@/shared/supabase/client'
import { ErreurSupabase, lancerSiErreur } from '@/shared/supabase/erreurs'
import type { Database } from '@/shared/supabase/types'

/**
 * Sessions — les périodes qui regroupent les cours d'un centre (migration 0022).
 *
 * La session est de la **structure** : écriture réservée au responsable, lecture
 * ouverte à tous les membres du centre. `centre_id` est posé par la base.
 *
 * Une session ne se supprime pas — aucune policy de DELETE n'est accordée. Une
 * session créée par erreur se **renomme** ; une session finie se **clôture**.
 * Supprimer poserait la question « et ses cours ? », à laquelle la clé étrangère
 * répond déjà par un refus sec.
 */
type TableSession = Database['public']['Tables']['session']

export type Session = TableSession['Row']
export type SessionInput = Omit<
  TableSession['Insert'],
  'id' | 'centre_id' | 'created_at' | 'updated_at'
>

export const STATUTS_SESSION = ['en_cours', 'terminee'] as const
export type StatutSession = (typeof STATUTS_SESSION)[number]

/**
 * Toutes les sessions du centre, la plus récente en tête.
 *
 * L'ordre est celui du sélecteur : on travaille presque toujours dans la
 * dernière ouverte, elle doit être la première proposée.
 */
export async function list(): Promise<Session[]> {
  const { data, error } = await getSupabaseClient()
    .from('session')
    .select('*')
    .order('date_debut', { ascending: false })
    .order('created_at', { ascending: false })

  lancerSiErreur(error, 'Chargement des sessions')

  return data ?? []
}

export async function creer(session: SessionInput): Promise<Session> {
  const { data, error } = await getSupabaseClient()
    .from('session')
    .insert(session)
    .select('*')
    .single()

  // La contrainte `unique (centre_id, nom)` mérite un message précis : c'est la
  // faute la plus probable, et « cet enregistrement existe déjà » ne dit pas
  // laquelle.
  if (error?.code === '23505') {
    throw new ErreurSupabase('Une session porte déjà ce nom dans ce centre.', error)
  }
  lancerSiErreur(error, 'Création de la session')

  return data
}

export async function modifier(id: string, session: Partial<SessionInput>): Promise<Session> {
  const { data, error } = await getSupabaseClient()
    .from('session')
    .update(session)
    .eq('id', id)
    .select('*')
    .single()

  lancerSiErreur(error, 'Modification de la session')

  return data
}
