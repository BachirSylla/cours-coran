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

export interface ReconductionInput {
  sessionSourceId: string
  nom: string
  dateDebut: string
  dateFin?: string | null
}

/**
 * Ouvre la session suivante en recopiant la **structure** des cours (migration
 * 0024) : libellé, type, niveau, format, enseignant, créneaux, réglages, tarif.
 *
 * Ne recopie NI inscriptions, NI séances, NI présences, NI notes, NI examens —
 * la pédagogie repart à zéro et l'historique reste dans la session source. Ni
 * lien de visioconférence (périmé, il ferait croire qu'il fonctionne), ni jeton
 * de partage (recopier un secret donnerait à l'ancien public l'accès au nouveau
 * cours).
 *
 * Atomique et gardée `est_responsable()` côté base : le client ne peut ni
 * nommer le centre, ni contourner la garde.
 */
export async function reconduire(entree: ReconductionInput): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc('reconduire_session', {
    p_session_id: entree.sessionSourceId,
    p_nom: entree.nom,
    p_date_debut: entree.dateDebut,
    // Les arguments d'une fonction Postgres ne portent pas de nullabilité : les
    // types générés la déclarent obligatoire, alors que `null` est la valeur qui
    // dit « pas de fin prévue ».
    p_date_fin: (entree.dateFin ?? null) as string,
  })

  lancerSiErreur(error, 'Ouverture de la session suivante')

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
