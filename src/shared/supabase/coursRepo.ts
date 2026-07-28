import { getSupabaseClient } from '@/shared/supabase/client'
import { ErreurSupabase, lancerSiErreur } from '@/shared/supabase/erreurs'
import type { Database, Json } from '@/shared/supabase/types'

/**
 * Accès aux cours — couche repository (CLAUDE.md §3).
 *
 * Un cours et ses créneaux forment un tout : l'écriture passe par la fonction
 * `enregistrer_cours` (migration 0002), qui les enregistre dans une seule
 * transaction et refuse tout chevauchement avec un autre cours.
 */
type TableCours = Database['public']['Tables']['cours']

export type Cours = TableCours['Row']
export type Creneau = Database['public']['Tables']['creneau']['Row']

/** Champs du cours pilotés par l'utilisateur (`owner_id` reste à la base). */
export type CoursInput = Omit<
  TableCours['Insert'],
  'id' | 'owner_id' | 'created_at' | 'updated_at'
>

/** Créneau tel que saisi dans le formulaire (sans identité ni propriétaire). */
export interface CreneauInput {
  jour_semaine: number
  heure_debut: string
  heure_fin: string
}

/** Un cours accompagné de son type, de ses créneaux et du nombre d'inscrits. */
export type CoursAvecDetails = Cours & {
  type_cours: { libelle: string } | null
  creneau: Creneau[]
  /** Agrégat PostgREST : évite une requête de comptage par cours. */
  inscription: { count: number }[]
}

const SELECT_DETAILS = '*, type_cours(libelle), creneau(*), inscription(count)'

/** Nombre d'apprenants inscrits, extrait de l'agrégat. */
export function nombreInscrits(cours: Pick<CoursAvecDetails, 'inscription'>): number {
  return cours.inscription[0]?.count ?? 0
}

/** Trie les créneaux d'un cours par jour puis heure (PostgREST ne trie pas l'embed). */
function trierCreneaux(cours: CoursAvecDetails): CoursAvecDetails {
  return {
    ...cours,
    creneau: [...cours.creneau].sort(
      (a, b) => a.jour_semaine - b.jour_semaine || a.heure_debut.localeCompare(b.heure_debut)
    ),
  }
}

export async function list(): Promise<CoursAvecDetails[]> {
  const { data, error } = await getSupabaseClient()
    .from('cours')
    .select(SELECT_DETAILS)
    .order('libelle', { ascending: true })

  lancerSiErreur(error, 'Chargement des cours')

  return (data ?? []).map(trierCreneaux)
}

export async function getById(id: string): Promise<CoursAvecDetails | null> {
  const { data, error } = await getSupabaseClient()
    .from('cours')
    .select(SELECT_DETAILS)
    .eq('id', id)
    .maybeSingle()

  lancerSiErreur(error, 'Chargement du cours')

  return data ? trierCreneaux(data) : null
}

/**
 * Crée ou met à jour un cours **et** ses créneaux en une seule transaction.
 * Les créneaux fournis remplacent intégralement les précédents.
 */
async function enregistrer(
  input: CoursInput,
  creneaux: CreneauInput[],
  coursId?: string
): Promise<Cours> {
  // La RPC déclare ses paramètres en `jsonb`, donc `Json` côté types générés :
  // nos objets sont sérialisables tels quels, seul le type nominal diffère.
  const { data, error } = await getSupabaseClient().rpc('enregistrer_cours', {
    p_cours: input as unknown as Json,
    p_creneaux: creneaux as unknown as Json,
    ...(coursId ? { p_cours_id: coursId } : {}),
  })

  lancerSiErreur(error, coursId ? 'Modification du cours' : 'Création du cours')

  if (!data) {
    throw new ErreurSupabase('Enregistrement du cours : aucune donnée renvoyée.')
  }

  return data
}

export function create(input: CoursInput, creneaux: CreneauInput[]): Promise<Cours> {
  return enregistrer(input, creneaux)
}

export function update(
  id: string,
  input: CoursInput,
  creneaux: CreneauInput[]
): Promise<Cours> {
  return enregistrer(input, creneaux, id)
}

/** Les créneaux du cours disparaissent avec lui (`on delete cascade`). */
export async function remove(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from('cours').delete().eq('id', id)

  lancerSiErreur(error, 'Suppression du cours')
}
