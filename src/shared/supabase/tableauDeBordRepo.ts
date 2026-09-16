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

/**
 * Un pointage réduit à ce que l'assiduité regarde — plus sa séance et sa
 * personne, sans lesquelles on ne peut pas savoir QUI n'a pas été pointé.
 */
export interface PointagePourAssiduite {
  seance_id: string
  apprenant_id: string
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
      .select('seance_id, apprenant_id, present, etat')
      .in('cours_id', coursIds)
      // ⚠️ Un ordre STABLE : sans lui, deux pages successives peuvent se
      // recouvrir ou se trouer, et `range` ne paginerait rien de fiable.
      .order('id')
      .range(debut, debut + PAGE - 1)

    lancerSiErreur(error, "Chargement de l'assiduité")

    const page = data ?? []
    tous.push(...page)

    if (page.length < PAGE) return tous

    debut += PAGE
  }
}

/** Une séance tenue, réduite à ce que l'assiduité croise. */
export interface SeanceTenuePourAssiduite {
  id: string
  cours_id: string
  date: string
}

/**
 * Les séances au statut `faite` des cours donnés (migration 0029).
 *
 * ⚠️ C'est d'elles que part l'assiduité, plus des pointages : une séance tenue
 * où personne n'a été pointé compte chaque inscrit PRÉSENT, comme l'écran de
 * saisie l'affiche et comme le rapport l'imprime. La garde de date n'est pas
 * ici : « aujourd'hui » est celui du navigateur (`pointagesEffectifs`).
 *
 * Paginé pour la même raison que `listPointages` — `max_rows` coupe en silence.
 */
export async function listSeancesTenues(
  coursIds: readonly string[]
): Promise<SeanceTenuePourAssiduite[]> {
  if (coursIds.length === 0) return []

  const client = getSupabaseClient()
  const toutes: SeanceTenuePourAssiduite[] = []
  let debut = 0

  for (;;) {
    const { data, error } = await client
      .from('seance')
      .select('id, cours_id, date')
      .in('cours_id', coursIds)
      .eq('statut', 'faite')
      .order('id')
      .range(debut, debut + PAGE - 1)

    lancerSiErreur(error, 'Chargement des séances tenues')

    const page = data ?? []
    toutes.push(...page)

    if (page.length < PAGE) return toutes

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

  const client = getSupabaseClient()
  const tous: InscritDeCours[] = []
  let debut = 0

  /*
   * ⚠️ PAGINÉ depuis 0029 : cette liste nourrit aussi l'ASSIDUITÉ, qui croise
   * chaque inscrit avec chaque séance tenue. Coupée à `max_rows`, elle ferait
   * disparaître en silence des personnes entières du taux — pointages réels
   * compris.
   */
  for (;;) {
    const { data, error } = await client
      .from('inscription')
      .select('apprenant_id, cours_id')
      .in('cours_id', coursIds)
      .order('id')
      .range(debut, debut + PAGE - 1)

    lancerSiErreur(error, 'Chargement des inscrits')

    const page = data ?? []
    tous.push(...page)

    if (page.length < PAGE) return tous

    debut += PAGE
  }
}

/** Un règlement réduit à ce que la courbe de trésorerie regarde. */
export interface ReglementPourCourbe {
  date_paiement: string | null
  mois: string | null
  montant_recu: number
}

/**
 * Les règlements des cours donnés, **toutes périodes et les deux porteurs
 * confondus** — nominatifs comme forfaits de classe (0027).
 *
 * ⚠️ Couvre les DEUX formes de porteur (0027) : un règlement de classe a
 * `inscription_id` nul, et l'embed `inscription!inner` l'écarterait.
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

  const client = getSupabaseClient()

  /*
   * ⚠️ Les DEUX formes de porteur (0027). L'embed `inscription!inner` écarte par
   * construction les règlements de classe, dont `inscription_id` est nul : la
   * courbe de trésorerie ignorait alors tout l'argent encaissé au forfait, et
   * les deux écrans se contredisaient sans que rien ne l'explique.
   */
  const [parInscription, parCours] = await Promise.all([
    client
      .from('reglement')
      .select('date_paiement, mois, montant_recu, inscription!inner(cours_id)')
      .in('inscription.cours_id', coursIds),
    client
      .from('reglement')
      .select('date_paiement, mois, montant_recu')
      .in('cours_id', coursIds),
  ])

  lancerSiErreur(parInscription.error, 'Chargement des encaissements')
  lancerSiErreur(parCours.error, 'Chargement des encaissements')

  return [...(parInscription.data ?? []), ...(parCours.data ?? [])].map((ligne) => ({
    date_paiement: ligne.date_paiement,
    mois: ligne.mois,
    montant_recu: ligne.montant_recu,
  }))
}

/** Le nombre de séances tenues, cours par cours. */
export interface SeancesFaitesDuCours {
  cours_id: string
  faites: number
}

/**
 * Combien de séances ont réellement eu lieu, par cours, dans une session
 * (migration 0028).
 *
 * ⚠️ **Une agrégation SQL, pas une liste comptée ici.** Rapatrier une ligne par
 * séance aurait buté sur `max_rows` (1000), que PostgREST applique **en
 * silence** : le compteur d'un centre actif serait devenu faux au fil des
 * sessions, sans erreur ni indice. C'est la leçon de `listPointages`, appliquée
 * avant d'en payer le prix.
 *
 * La fonction est `security invoker` : la policy `seance_select` porte sur
 * `cours_lisibles()`, donc un enseignant ne compte que SES cours. Rien n'ouvre
 * de porte — c'est la RLS qui cloisonne, comme partout.
 *
 * ⚠️ Un cours **sans aucune séance tenue n'est pas rendu** : `group by` ne
 * fabrique pas de ligne à zéro. L'appelant lit alors zéro, ce qui est la vérité.
 */
export async function listSeancesFaites(
  sessionId: string
): Promise<SeancesFaitesDuCours[]> {
  const { data, error } = await getSupabaseClient().rpc('seances_faites_par_cours', {
    p_session_id: sessionId,
  })

  lancerSiErreur(error, 'Chargement des séances tenues')

  return (data ?? []).map((ligne) => ({ cours_id: ligne.id_cours, faites: ligne.faites }))
}
