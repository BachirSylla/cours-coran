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
 * La **structure** d'un cours : ce que le responsable pilote (migration 0017).
 *
 * Ce n'est plus un `Omit<>` de la ligne `cours`, et ce ne peut plus l'être :
 * `prix_mensuel` et `devise` ont quitté la table pour `tarif`, tout en restant
 * de la charge utile — `enregistrer_cours` les y route. Une interface explicite
 * dit mieux ce qui part au serveur qu'une soustraction de colonnes.
 *
 * Ce qui n'y figure PAS relève de l'enseignant, par ses propres RPC : le lien
 * visio, le jeton de partage, le logo et les six surcharges de notation.
 *
 * `enseignant_id` : `null` signifie « inchangé », jamais « désaffecter ».
 */
export interface CoursInput {
  libelle: string
  type_cours_id: string
  format: string
  /**
   * Session du cours (0022). Obligatoire à la création — `enregistrer_cours`
   * lève P0060 sinon. À la modification, l'omettre laisse le cours en place :
   * le silence n'est pas un déplacement.
   */
  session_id: string
  niveau?: string | null
  date_debut: string
  date_fin?: string | null
  statut?: string
  enseignant_id?: string | null
  /** Routé vers `tarif`, que seul un responsable lit et écrit. */
  prix_mensuel?: number | null
  devise?: string
}

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
  /**
   * Tarif du cours (migration 0017), en **tableau** : la clé étrangère de
   * `tarif` est composite `(cours_id, centre_id)`, et PostgREST n'y reconnaît
   * donc pas une relation un-à-un — alors que `cours_id` en est bien la clé
   * primaire. Passer par `tarifDuCours()` plutôt que d'éparpiller des `[0]`.
   *
   * **Vide pour un enseignant** : la table est gardée `est_responsable()` en
   * lecture, et un embed que la RLS filtre revient vide plutôt qu'en erreur.
   * Ce n'est pas un cas d'exception à traiter — c'est le comportement voulu.
   */
  tarif: { prix_mensuel: number | null; devise: string }[]
}

/** Le tarif du cours, ou `null` — ce que voit un enseignant. */
export function tarifDuCours(
  cours: CoursAvecDetails
): { prix_mensuel: number | null; devise: string } | null {
  return cours.tarif[0] ?? null
}

const SELECT_DETAILS =
  '*, type_cours(libelle), creneau(*), inscription(count), tarif(prix_mensuel, devise)'

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

/**
 * Les cours d'une session.
 *
 * `sessionId` est **obligatoire** : un centre qui n'a jamais créé de session en
 * a tout de même une, posée par le backfill de 0022. Rendre le paramètre
 * facultatif rouvrirait la porte à une liste « tous cours, toutes sessions
 * confondues » — visuellement identique à aujourd'hui pour un centre à session
 * unique, et fausse dès la deuxième.
 */
export async function list(sessionId: string): Promise<CoursAvecDetails[]> {
  const { data, error } = await getSupabaseClient()
    .from('cours')
    .select(SELECT_DETAILS)
    .eq('session_id', sessionId)
    .order('libelle', { ascending: true })

  lancerSiErreur(error, 'Chargement des cours')

  return (data ?? []).map(trierCreneaux)
}

/**
 * **Tous** les cours du centre, toutes sessions confondues.
 *
 * À n'employer que là où la session n'a pas de sens — le retrait d'un membre,
 * par exemple : `retirer_membre` réaffecte ses cours **toutes sessions**, donc
 * l'écran qui annonce ce qui va être transféré doit compter la même chose que
 * la base. Filtrer sur la session affichée y ferait disparaître des cours du
 * décompte, et parfois le sélecteur de repreneur tout entier — le responsable
 * récupérerait alors des cours qu'il n'a jamais vus.
 *
 * Partout ailleurs, c'est `list(sessionId)` qu'il faut.
 */
export async function listToutesSessions(): Promise<CoursAvecDetails[]> {
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
 * `null` sur un champ signifie « hériter du centre ».
 *
 * Passe par une RPC depuis la migration 0017, et il ne peut plus en être
 * autrement : ces colonnes sont sorties des `grant` de `cours`, parce qu'un
 * privilège de colonne ne sait pas distinguer le responsable de l'enseignant —
 * les deux sont le même rôle Postgres. La RPC, elle, vérifie que l'appelant
 * enseigne ce cours.
 */
export async function definirReglages(id: string, surcharges: SurchargesCours): Promise<void> {
  const { error } = await getSupabaseClient().rpc('definir_reglages_cours', {
    p_cours_id: id,
    p_reglages: surcharges as unknown as Json,
  })

  lancerSiErreur(error, 'Enregistrement des réglages du cours')
}

/**
 * Lien de visioconférence — l'enseignant du cours, et lui seul (migration 0017).
 *
 * Il a quitté le formulaire de structure pour la même raison que les réglages :
 * la colonne est hors des `grant`, la RPC porte la garde.
 */
export async function definirLienMeet(id: string, lien: string | null): Promise<void> {
  const { error } = await getSupabaseClient().rpc('definir_lien_meet', {
    p_cours_id: id,
    p_lien: lien ?? '',
  })

  lancerSiErreur(error, 'Enregistrement du lien de visioconférence')
}

/**
 * Partage public d'un cours (migration 0007).
 *
 * Les trois opérations passent par une RPC plutôt que par un `update` : le
 * jeton est ainsi tiré par le CSPRNG **du serveur** — le navigateur ne choisit
 * jamais le secret — et l'écriture reste atomique. Depuis la migration 0017
 * elles sont `security definer` et vérifient elles-mêmes que l'appelant
 * **enseigne** le cours : `jeton_partage` est sorti des `grant`, une fonction
 * `invoker` ne pourrait plus l'écrire.
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
