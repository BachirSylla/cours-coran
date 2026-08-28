import { getSupabaseClient } from '@/shared/supabase/client'
import { lancerSiErreur } from '@/shared/supabase/erreurs'
import type { Database } from '@/shared/supabase/types'

/**
 * Séances — occurrences réelles d'un cours (CLAUDE.md §4).
 *
 * Les séances ne sont pas pré-générées : `upsert` crée la ligne au moment de la
 * première saisie et la met à jour ensuite, sur la clé
 * `(cours_id, date, heure_debut)`. L'appelant n'a donc pas à savoir si la
 * séance existait déjà. `centre_id` est posé par la base.
 */
type TableSeance = Database['public']['Tables']['seance']

export type Seance = TableSeance['Row']

/** Champs saisis par l'enseignant, plus la clé de l'occurrence. */
export type SeanceInput = Omit<
  TableSeance['Insert'],
  'id' | 'owner_id' | 'centre_id' | 'created_at' | 'updated_at'
>

const COLONNES = '*'

/** Séances d'une plage de dates — la semaine ou le mois affiché. Bornes incluses. */
export async function listBetween(dateDebut: string, dateFin: string): Promise<Seance[]> {
  const { data, error } = await getSupabaseClient()
    .from('seance')
    .select(COLONNES)
    .gte('date', dateDebut)
    .lte('date', dateFin)
    .order('date', { ascending: true })
    .order('heure_debut', { ascending: true })

  lancerSiErreur(error, 'Chargement des séances')

  return data ?? []
}

export async function listByCours(coursId: string): Promise<Seance[]> {
  const { data, error } = await getSupabaseClient()
    .from('seance')
    .select(COLONNES)
    .eq('cours_id', coursId)
    .order('date', { ascending: false })
    .order('heure_debut', { ascending: true })

  lancerSiErreur(error, 'Chargement des séances du cours')

  return data ?? []
}

/** Séance et le pointage de chacun — une colonne de la grille du rapport. */
export type SeanceAvecPresences = Seance & {
  presence: Database['public']['Tables']['presence']['Row'][]
}

/**
 * Séances d'un cours, chacune avec ses présences — la matière du rapport de
 * session.
 *
 * La requête part de `seance` et non de `presence`, et ce n'est pas indifférent.
 * Depuis `presence`, filtrer par cours imposerait `seance!inner(...)` : sans le
 * `!inner`, PostgREST n'applique le filtre qu'à la ressource **embarquée** et
 * renvoie quand même les présences de tous les cours, avec `seance: null` — sans
 * la moindre erreur, et l'assiduité sortirait fausse. Ici le filtre porte sur
 * une colonne du parent, donc aucune subtilité.
 *
 * Bénéfice supplémentaire : les séances où personne n'a été pointé remontent
 * avec un tableau vide. Leur colonne doit précisément apparaître dans la grille.
 */
export async function listAvecPresences(coursId: string): Promise<SeanceAvecPresences[]> {
  const { data, error } = await getSupabaseClient()
    .from('seance')
    .select('*, presence(*)')
    .eq('cours_id', coursId)
    .order('date', { ascending: true })
    .order('heure_debut', { ascending: true })

  lancerSiErreur(error, 'Chargement des séances et des présences du cours')

  return data ?? []
}

export async function getById(id: string): Promise<Seance | null> {
  const { data, error } = await getSupabaseClient()
    .from('seance')
    .select(COLONNES)
    .eq('id', id)
    .maybeSingle()

  lancerSiErreur(error, 'Chargement de la séance')

  return data
}

/**
 * Crée la séance ou met à jour celle qui occupe déjà la même occurrence.
 * Idempotent : deux saisies successives ne créent jamais de doublon.
 */
export async function upsert(input: SeanceInput): Promise<Seance> {
  const { data, error } = await getSupabaseClient()
    .from('seance')
    .upsert(input, { onConflict: 'cours_id,date,heure_debut' })
    .select(COLONNES)
    .single()

  lancerSiErreur(error, 'Enregistrement de la séance')

  return data
}

/** Les présences de la séance tombent en cascade. */
export async function remove(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from('seance').delete().eq('id', id)

  lancerSiErreur(error, 'Suppression de la séance')
}
