import { getSupabaseClient } from '@/shared/supabase/client'
import { lancerSiErreur } from '@/shared/supabase/erreurs'
import type { Database } from '@/shared/supabase/types'

/**
 * Règlements au grain **(inscription, période)** — migration 0026.
 *
 * Frère de `paiementRepo`, qui reste en place pour l'historique d'avant bascule
 * au grain `(cours, mois)`. Les deux ne se mélangent jamais : le premier suit
 * des personnes, le second des totaux de cours.
 *
 * Toute la table est gardée `est_responsable()` **en lecture comme en écriture**
 * — un enseignant ne voit aucun règlement, pas même sur ses propres cours. Une
 * requête faite par un enseignant revient donc VIDE, jamais en erreur : ce n'est
 * pas un cas d'exception à traiter.
 */
type TableReglement = Database['public']['Tables']['reglement']

export type Reglement = TableReglement['Row']

/**
 * Ce qu'on écrit. `centre_id` est posé par la base (`default centre_courant()`),
 * et la période prend l'une OU l'autre forme — jamais les deux.
 */
export interface ReglementInput {
  inscription_id: string
  /** `AAAA-MM` en mode mensuel. */
  mois?: string | null
  /** L'identifiant de session au forfait. */
  session_id?: string | null
  montant_du: number
  montant_recu: number
  date_paiement?: string | null
  methode?: string | null
}

/**
 * Une inscription telle que la facturation a besoin de la voir : la personne, le
 * cours, sa session et son tarif.
 *
 * ⚠️ `tarif` arrive en **tableau**, comme partout ailleurs : sa clé étrangère
 * est composite `(cours_id, centre_id)`, et PostgREST n'y reconnaît donc pas une
 * relation un-à-un — alors que `cours_id` en est bien la clé primaire.
 */
export interface InscriptionAFacturer {
  id: string
  apprenant_id: string
  cours_id: string
  created_at: string
  apprenant: { nom: string; prenom: string } | null
  cours: {
    id: string
    libelle: string
    /** `actif` | `pause` | `termine` — seuls les cours actifs sont facturés. */
    statut: string
    date_debut: string
    date_fin: string | null
    session: { id: string; nom: string; date_debut: string; date_fin: string | null } | null
    tarif: { prix_mensuel: number | null; prix_session: number | null; devise: string }[]
  } | null
}

/*
 * ⚠️ UNE SEULE CHAÎNE LITTÉRALE, si longue soit-elle. Concaténée avec `+`, elle
 * devient `string` pour TypeScript, et l'inférence de `supabase-js` retombe sur
 * `GenericStringError[]` : le résultat cesse d'être typé sans que rien ne
 * signale la vraie cause.
 */
// prettier-ignore
const SELECT_A_FACTURER = 'id, apprenant_id, cours_id, created_at, apprenant(nom, prenom), cours!inner(id, libelle, statut, date_debut, date_fin, session(id, nom, date_debut, date_fin), tarif(prix_mensuel, prix_session, devise))'

/**
 * Toutes les inscriptions à facturer dans une session, avec de quoi calculer.
 *
 * `cours!inner` est nécessaire : sans la jointure interne, PostgREST rendrait
 * les inscriptions dont le cours ne correspond pas au filtre, avec un embed nul
 * — c'est-à-dire toutes les inscriptions du centre, la plupart inexploitables.
 */
export async function listAFacturer(sessionId: string): Promise<InscriptionAFacturer[]> {
  const { data, error } = await getSupabaseClient()
    .from('inscription')
    .select(SELECT_A_FACTURER)
    .eq('cours.session_id', sessionId)

  lancerSiErreur(error, 'Chargement des inscriptions à facturer')

  return (data ?? []).sort((a, b) => {
    const parCours = (a.cours?.libelle ?? '').localeCompare(b.cours?.libelle ?? '', 'fr')
    if (parCours !== 0) return parCours

    return `${a.apprenant?.nom ?? ''} ${a.apprenant?.prenom ?? ''}`.localeCompare(
      `${b.apprenant?.nom ?? ''} ${b.apprenant?.prenom ?? ''}`,
      'fr'
    )
  })
}

/**
 * Les règlements de ces inscriptions, toutes périodes confondues.
 *
 * Filtré par identifiants plutôt que par un embed imbriqué : le nombre
 * d'inscriptions d'un centre se compte en dizaines, et un `in` reste lisible là
 * où `inscription.cours.session_id` empile deux jointures dont on ne verrait
 * plus l'effet en cas d'erreur.
 */
export async function listPourInscriptions(inscriptionIds: readonly string[]): Promise<Reglement[]> {
  if (inscriptionIds.length === 0) return []

  const { data, error } = await getSupabaseClient()
    .from('reglement')
    .select('*')
    .in('inscription_id', inscriptionIds)

  lancerSiErreur(error, 'Chargement des règlements')

  return data ?? []
}

/**
 * Enregistre ou met à jour le règlement d'une période.
 *
 * ⚠️ Pas d'`upsert` : les deux unicités sont des index **partiels**
 * (`where mois is not null`, `where session_id is not null`), et PostgREST ne
 * sait pas viser un index partiel — `onConflict` attend une contrainte nommée.
 * On lit donc la ligne existante, puis on insère ou on met à jour. La course est
 * bénigne : deux saisies simultanées de la même période par le même responsable
 * n'arrivent pas, et l'index refuserait de toute façon le doublon.
 */
export async function enregistrer(entree: ReglementInput): Promise<Reglement> {
  const client = getSupabaseClient()

  const recherche = client
    .from('reglement')
    .select('id')
    .eq('inscription_id', entree.inscription_id)

  const { data: existant, error: erreurLecture } = await (
    entree.mois != null
      ? recherche.eq('mois', entree.mois)
      : recherche.eq('session_id', entree.session_id as string)
  ).maybeSingle()

  lancerSiErreur(erreurLecture, 'Enregistrement du règlement')

  if (existant) {
    const { data, error } = await client
      .from('reglement')
      .update({
        montant_du: entree.montant_du,
        montant_recu: entree.montant_recu,
        date_paiement: entree.date_paiement ?? null,
        methode: entree.methode ?? null,
      })
      .eq('id', existant.id)
      .select('*')
      .single()

    lancerSiErreur(error, 'Enregistrement du règlement')

    return data
  }

  const { data, error } = await client
    .from('reglement')
    .insert({
      inscription_id: entree.inscription_id,
      mois: entree.mois ?? null,
      session_id: entree.session_id ?? null,
      montant_du: entree.montant_du,
      montant_recu: entree.montant_recu,
      date_paiement: entree.date_paiement ?? null,
      methode: entree.methode ?? null,
    })
    .select('*')
    .single()

  lancerSiErreur(error, 'Enregistrement du règlement')

  return data
}

/** Retire un règlement saisi par erreur. On n'efface pas une recette à la légère. */
export async function supprimer(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from('reglement').delete().eq('id', id)

  lancerSiErreur(error, 'Suppression du règlement')
}
