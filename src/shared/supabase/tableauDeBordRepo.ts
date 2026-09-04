import { getSupabaseClient } from '@/shared/supabase/client'
import { lancerSiErreur } from '@/shared/supabase/erreurs'

/**
 * Les deux lectures que le tableau de bord ne peut pas emprunter ailleurs.
 *
 * Tout le reste vient des hooks déjà en place — cours, règlements, séances,
 * membres, sessions. C'est délibéré : une agrégation SQL parallèle aurait créé
 * une **seconde source de vérité**, et le tableau de bord se serait mis à
 * contredire la page Paiements sans que rien ne l'explique. Le prix est quelques
 * requêtes de plus, toutes parallèles et sans N+1.
 *
 * ⚠️ **Rien ici n'est `security definer`.** Ces fonctions lisent par le client
 * ordinaire : la RLS s'applique telle quelle, et un enseignant reçoit ce que
 * `cours_lisibles()` lui ouvre — ni plus, ni moins. Le tableau de bord n'ouvre
 * aucune porte ; il regroupe ce que le viewer avait déjà le droit de lire.
 */

/**
 * Taille de page. Sous le `max_rows` de PostgREST (1000) : une page pleine
 * signifie « il y en a peut-être d'autres », une page incomplète « c'est fini ».
 */
const PAGE = 1000

/** Un pointage réduit à ce que l'assiduité regarde. */
export interface PointagePourAssiduite {
  present: boolean
  etat: string | null
}

/**
 * Les pointages des cours donnés.
 *
 * ⚠️ On rapatrie deux colonnes par pointage plutôt que d'agréger côté serveur.
 * C'est un arbitrage assumé : `chiffresAssiduite` est déjà écrit et éprouvé, et
 * une RPC de comptage en dupliquerait la règle — notamment le repli de `etat`
 * nul sur le booléen `present`, qu'il faudrait alors maintenir aux deux endroits.
 * À l'échelle d'un centre (quelques centaines à quelques milliers de pointages
 * par session) le coût est négligeable. Le jour où un centre en compte des
 * dizaines de milliers, c'est ici qu'il faudra une agrégation — et alors en
 * `security invoker`, pour que la RLS continue de s'appliquer.
 */
export async function listPointages(
  coursIds: readonly string[]
): Promise<PointagePourAssiduite[]> {
  if (coursIds.length === 0) return []

  const client = getSupabaseClient()
  const tous: PointagePourAssiduite[] = []
  let debut = 0

  /*
   * ⚠️ PAGINÉ, et ce n'est pas de la prudence gratuite. PostgREST plafonne à
   * `max_rows` (1000 chez Supabase comme dans `supabase/config.toml`) et **coupe
   * en silence** : sans erreur, sans indice. Une session de plus de mille
   * pointages — ce que le commentaire ci-dessus donne pour ordre de grandeur
   * courant — aurait vu son assiduité calculée sur un sous-ensemble arbitraire,
   * et le taux affiché aurait été faux sans que rien ne le signale.
   */
  for (;;) {
    const { data, error } = await client
      .from('presence')
      .select('present, etat')
      .in('cours_id', coursIds)
      .range(debut, debut + PAGE - 1)

    lancerSiErreur(error, "Chargement de l'assiduité")

    const page = data ?? []
    tous.push(...page)

    if (page.length < PAGE) return tous

    debut += PAGE
  }
}

/** Une inscription réduite à l'identité de la personne. */
export interface InscritDeCours {
  apprenant_id: string
  cours_id: string
}

/**
 * Qui était inscrit dans les cours donnés — ceux de la session **précédente**,
 * retrouvés par `cours.reconduit_de` (migration 0024).
 *
 * C'est ce qui permet de dire « revenu » plutôt que « parti puis nouveau » d'un
 * apprenant passé de Niveau 1 à Niveau 2 : la comparaison porte sur l'identité
 * de la personne, jamais sur la ligne d'inscription, qui change à chaque session.
 */
export async function listInscritsDeCours(
  coursIds: readonly string[]
): Promise<InscritDeCours[]> {
  if (coursIds.length === 0) return []

  const { data, error } = await getSupabaseClient()
    .from('inscription')
    .select('apprenant_id, cours_id')
    .in('cours_id', coursIds)

  lancerSiErreur(error, 'Chargement de la session précédente')

  return data ?? []
}

/** Un règlement réduit à ce que la courbe de trésorerie regarde. */
export interface ReglementPourCourbe {
  date_paiement: string | null
  mois: string | null
  montant_recu: number
}

/**
 * Les règlements des cours donnés, **toutes périodes confondues**.
 *
 * ⚠️ Lecture SÉPARÉE de celle de la page Paiements, et c'est nécessaire :
 * `assemblerFacturation` filtre déjà sur la période affichée, si bien qu'une
 * courbe puisée dans ses lignes ne pouvait montrer qu'un seul mois — cinq des
 * six barres étaient structurellement vides. Un graphe de trésorerie regarde
 * plus loin que la période qu'on facture.
 *
 * `reglement` reste gardée `est_responsable()` en lecture : un enseignant reçoit
 * une liste vide, jamais une erreur.
 */
export async function listReglementsDesCours(
  coursIds: readonly string[]
): Promise<ReglementPourCourbe[]> {
  if (coursIds.length === 0) return []

  const { data, error } = await getSupabaseClient()
    .from('reglement')
    .select('date_paiement, mois, montant_recu, inscription!inner(cours_id)')
    .in('inscription.cours_id', coursIds)

  lancerSiErreur(error, 'Chargement des encaissements')

  return (data ?? []).map((ligne) => ({
    date_paiement: ligne.date_paiement,
    mois: ligne.mois,
    montant_recu: ligne.montant_recu,
  }))
}
