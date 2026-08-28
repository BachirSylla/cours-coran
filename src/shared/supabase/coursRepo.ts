import type { SurchargesCours } from '@/shared/lib/paramsCours'
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

/**
 * Champs du cours pilotés par l'utilisateur (`centre_id` reste à la base).
 * `jeton_partage` en est exclu : le secret du lien public n'est jamais choisi
 * par le formulaire, il est tiré par le serveur (voir `activerPartage`).
 *
 * `enseignant_id` en fait partie depuis la migration 0014 : le responsable
 * choisit qui assure le cours. `null` y signifie « inchangé », jamais
 * « désaffecter ».
 */
export type CoursInput = Omit<
  TableCours['Insert'],
  | 'id'
  | 'centre_id'
  | 'created_at'
  | 'updated_at'
  | 'jeton_partage'
  // Les surcharges de notation et le logo (migration 0011) ne passent pas non
  // plus par le formulaire : ils ont leur propre section et leur propre
  // écriture, et `enregistrer_cours` n'écrit pas ces colonnes.
  | 'logo'
  | 'assiduite_active'
  | 'base_academique'
  | 'bareme_assiduite'
  | 'penalite_absence'
  | 'penalite_retard'
  | 'penaliser_absences_excusees'
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

/**
 * Réglages propres à un cours (migration 0011) : notation et logo.
 *
 * `null` sur un champ signifie « hériter du centre ». Un simple `update` suffit
 * — la policy `cours_update_own` fait le contrôle d'accès, et ces colonnes sont
 * hors du périmètre de `enregistrer_cours`, qui reste consacrée au cours et à
 * ses créneaux.
 */
export async function definirReglages(id: string, surcharges: SurchargesCours): Promise<Cours> {
  const { data, error } = await getSupabaseClient()
    .from('cours')
    .update(surcharges)
    .eq('id', id)
    .select('*')
    .single()

  lancerSiErreur(error, 'Enregistrement des réglages du cours')

  return data
}

/**
 * Partage public d'un cours (migration 0007).
 *
 * Les trois opérations passent par une RPC plutôt que par un `update` : le
 * jeton est ainsi tiré par le CSPRNG **du serveur** — le navigateur ne choisit
 * jamais le secret — et l'écriture reste atomique. Les fonctions sont en
 * `security invoker` : c'est la policy `cours_update_own` qui autorise, ou non.
 */

/** Active le partage et renvoie le jeton. N'écrase pas un lien déjà actif. */
export async function activerPartage(id: string): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc('activer_partage', {
    p_cours_id: id,
  })

  lancerSiErreur(error, 'Activation du partage')

  // Aucune ligne mise à jour : cours supprimé, ou masqué par RLS.
  if (!data) {
    throw new ErreurSupabase('Activation du partage : cours introuvable.')
  }

  return data
}

/** Fait tourner le jeton : le lien déjà distribué cesse de fonctionner. */
export async function regenererToken(id: string): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc('regenerer_partage', {
    p_cours_id: id,
  })

  lancerSiErreur(error, 'Régénération du lien de partage')

  if (!data) {
    throw new ErreurSupabase('Régénération du lien de partage : cours introuvable.')
  }

  return data
}

export async function desactiverPartage(id: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('revoquer_partage', { p_cours_id: id })

  lancerSiErreur(error, 'Désactivation du partage')
}

/** Les créneaux du cours disparaissent avec lui (`on delete cascade`). */
export async function remove(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from('cours').delete().eq('id', id)

  lancerSiErreur(error, 'Suppression du cours')
}
