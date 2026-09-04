import { moisCourant, moisDe, moisSuivant, type StatutPaiement } from '@/shared/lib/paiements'

/**
 * Facturation au grain **(inscription, période)** — migration 0026.
 *
 * Frère de `paiements.ts`, et non son remplaçant : celui-ci raisonne au grain
 * `(cours, mois)`, qui reste celui de l'historique d'avant bascule. Les deux
 * cohabitent, et les helpers de mois ne sont pas dupliqués.
 *
 * Ce que ce module ajoute :
 *
 *   * le **mode** du centre — mensuel, ou forfait pour toute la session ;
 *   * le grain **nominatif** : dans un groupe de huit, huit lignes par période.
 *     Savoir qui a payé était impossible tant qu'un règlement portait sur le
 *     cours entier.
 *
 * Comme pour les séances et les mois dus, les périodes sont calculées **au fil
 * de l'eau** : une ligne `reglement` n'existe qu'une fois un règlement saisi, et
 * son `montant_du` est alors figé — un changement de tarif ne réécrit pas le
 * passé.
 *
 * Le **statut n'est jamais stocké** : il se déduit des montants et de la période
 * comparée à aujourd'hui. Une colonne le figerait, et il deviendrait faux tout
 * seul au passage d'un mois.
 *
 * Module **pur** : ni Supabase, ni React, ni DOM.
 */

export type ModeFacturation = 'mensuel' | 'par_session'

export const MODES_FACTURATION: readonly ModeFacturation[] = ['mensuel', 'par_session']

export const LIBELLES_MODE_FACTURATION: Record<ModeFacturation, string> = {
  mensuel: 'Au mois',
  par_session: 'Forfait par session',
}

/**
 * Le mode retenu tant que le centre n'en a pas choisi un autre.
 *
 * ⚠️ Il doit rester d'accord avec le défaut de la colonne en base : un centre
 * sans ligne `parametres` doit se comporter exactement comme avant 0026, sans
 * quoi la rétro-compatibilité ne tient que d'un côté.
 */
export const MODE_FACTURATION_PAR_DEFAUT: ModeFacturation = 'mensuel'

/**
 * Referme une valeur venue de la base sur le domaine. Les types générés
 * annoncent `string` : une valeur inconnue doit retomber sur le défaut plutôt
 * que de faire facturer n'importe quoi.
 */
export function estModeFacturation(valeur: string): valeur is ModeFacturation {
  return (MODES_FACTURATION as readonly string[]).includes(valeur)
}

/** Ce dont le calcul a besoin pour facturer UNE inscription. */
export interface InscriptionFacturable {
  /** `inscription.id` — la clé du règlement. */
  id: string
  apprenant_id: string
  cours_id: string
  /**
   * Entrée de l'apprenant dans CE cours, `AAAA-MM-JJ`.
   *
   * ⚠️ En mode mensuel, elle décale le premier mois dû quand elle est
   * postérieure au début du cours : quelqu'un qui arrive en mars ne doit pas
   * janvier et février. Elle ne crée jamais de prorata — un mois entamé est un
   * mois entier, c'est une décision produit.
   *
   * Une inscription saisie rétroactivement porte la date de SAISIE, pas celle de
   * l'entrée réelle : les mois antérieurs n'apparaîtront pas d'eux-mêmes. Le
   * responsable corrige alors le montant à la main — c'est le prix d'une donnée
   * qui n'a jamais été saisie, et le deviner serait pire.
   */
  inscrit_le: string
  cours_debut: string
  cours_fin: string | null
  /** La session du cours. `null` si elle n'est pas lisible. */
  session: { id: string; date_debut: string; date_fin: string | null } | null
  prix_mensuel: number | null
  prix_session: number | null
}

/** Une période à régler, telle que le calcul la produit. */
export interface PeriodeDue {
  inscription_id: string
  /** `AAAA-MM` en mode mensuel, `null` au forfait. */
  mois: string | null
  /** L'identifiant de session au forfait, `null` en mensuel. */
  session_id: string | null
  montant_du: number
}

/** Ce qu'une ligne enregistrée doit exposer pour être rapprochée d'une période. */
export interface ReglementRapprochable {
  inscription_id: string
  mois: string | null
  session_id: string | null
  montant_du: number
  montant_recu: number
}

export interface LigneReglement<T extends ReglementRapprochable = ReglementRapprochable> {
  inscription_id: string
  mois: string | null
  session_id: string | null
  montant_du: number
  montant_recu: number
  statut: StatutPaiement
  /** La ligne enregistrée, ou `null` si aucun règlement n'a été saisi. */
  reglement: T | null
  /**
   * Règlement encaissé pour une période qui n'est plus facturée — cours
   * raccourci, tarif retiré, apprenant désinscrit puis réinscrit. Conservé : on
   * n'efface pas une recette.
   */
  horsPeriode: boolean
}

/**
 * Clé de rapprochement d'une période. Le préfixe distingue les deux formes :
 * sans lui, une session dont l'identifiant ressemblerait à un mois entrerait en
 * collision — improbable, mais la clé ne coûte rien à rendre non ambiguë.
 */
export function clePeriode(periode: {
  inscription_id: string
  mois: string | null
  session_id: string | null
}): string {
  return periode.mois !== null
    ? `${periode.inscription_id}|m|${periode.mois}`
    : `${periode.inscription_id}|s|${periode.session_id ?? ''}`
}

/**
 * Les périodes dues d'une inscription, dans le mode donné.
 *
 * En **mensuel** : un dû par mois, du plus tard entre le début du cours et
 * l'entrée de l'apprenant, jusqu'au plus tôt entre la fin du cours et `moisMax`.
 *
 * Au **forfait** : exactement une période — la session — quelle que soit la date
 * d'arrivée. « Rejoindre en cours de session » ne donne droit à aucune remise :
 * c'est la décision produit, et elle est la même que le mois entamé.
 *
 * Sans tarif renseigné pour le mode actif, rien n'est dû : on ne facture pas un
 * montant qu'on n'a pas saisi.
 */
export function genererPeriodesDues(
  inscription: InscriptionFacturable,
  mode: ModeFacturation,
  moisMax: string = moisCourant()
): PeriodeDue[] {
  if (mode === 'par_session') {
    if (inscription.prix_session === null || inscription.session === null) return []

    return [
      {
        inscription_id: inscription.id,
        mois: null,
        session_id: inscription.session.id,
        montant_du: inscription.prix_session,
      },
    ]
  }

  if (inscription.prix_mensuel === null) return []

  const debutCours = moisDe(inscription.cours_debut)
  const arrivee = moisDe(inscription.inscrit_le)
  const premier = arrivee > debutCours ? arrivee : debutCours

  const finCours = inscription.cours_fin === null ? null : moisDe(inscription.cours_fin)
  const dernier = finCours !== null && finCours < moisMax ? finCours : moisMax

  if (premier > dernier) return []

  const dues: PeriodeDue[] = []
  for (let mois = premier; mois <= dernier; mois = moisSuivant(mois)) {
    dues.push({
      inscription_id: inscription.id,
      mois,
      session_id: null,
      montant_du: inscription.prix_mensuel,
    })
  }

  return dues
}

/**
 * Statut d'un forfait de session.
 *
 * ⚠️ Il ne se déduit PAS d'un mois : le forfait n'est en retard qu'une fois la
 * session **terminée**, pas au premier jour non payé. Réclamer dès l'ouverture
 * de la session contredirait « un forfait se règle au cours de la période », et
 * ferait passer tout le monde en rouge le lundi de la rentrée.
 *
 * Une session sans date de fin ne passe jamais en retard — la base refuse
 * d'ailleurs d'y enregistrer un forfait (P0080).
 */
export function statutForfait(
  montantDu: number,
  montantRecu: number,
  finSession: string | null,
  aujourdHui: string
): StatutPaiement {
  if (montantRecu >= montantDu) return 'paye'
  if (montantRecu > 0) return 'partiel'

  return finSession !== null && finSession < aujourdHui ? 'retard' : 'attente'
}

/** Le statut d'un mois : le mois courant est en attente, jamais en retard. */
export function statutMois(
  montantDu: number,
  montantRecu: number,
  mois: string,
  courant: string
): StatutPaiement {
  if (montantRecu >= montantDu) return 'paye'
  if (montantRecu > 0) return 'partiel'

  return mois < courant ? 'retard' : 'attente'
}

export interface ContexteStatut {
  /** `AAAA-MM` — pour juger les mois. */
  moisCourant: string
  /** `AAAA-MM-JJ` — pour juger la fin des sessions. */
  aujourdHui: string
  /** Fin de chaque session connue, par identifiant. */
  finDeSession: ReadonlyMap<string, string | null>
}

/**
 * Rapproche les périodes dues des règlements enregistrés et calcule les statuts.
 *
 * Un règlement sans période due correspondante est **conservé** et marqué
 * `horsPeriode` : il représente de l'argent réellement encaissé, et le faire
 * disparaître de l'écran parce que le cours a été raccourci serait une perte
 * comptable silencieuse.
 */
export function fusionnerReglements<T extends ReglementRapprochable>(
  periodesDues: readonly PeriodeDue[],
  reglementsExistants: readonly T[],
  contexte: ContexteStatut
): LigneReglement<T>[] {
  const parCle = new Map<string, T>()
  for (const reglement of reglementsExistants) {
    parCle.set(clePeriode(reglement), reglement)
  }

  const utilisees = new Set<string>()

  const statutDe = (
    du: number,
    recu: number,
    mois: string | null,
    sessionId: string | null
  ): StatutPaiement =>
    mois !== null
      ? statutMois(du, recu, mois, contexte.moisCourant)
      : statutForfait(
          du,
          recu,
          sessionId === null ? null : (contexte.finDeSession.get(sessionId) ?? null),
          contexte.aujourdHui
        )

  const lignes: LigneReglement<T>[] = periodesDues.map((due) => {
    const cle = clePeriode(due)
    const reglement = parCle.get(cle) ?? null
    if (reglement) utilisees.add(cle)

    /*
     * ⚠️ LE DÛ D'UNE LIGNE ENREGISTRÉE EST CELUI QU'ELLE PORTE, pas le tarif
     * courant. C'est ce qui « fige » le montant : sans cela, porter le tarif de
     * 15 000 à 20 000 réécrivait rétroactivement le dû de janvier — à l'écran
     * d'abord, puis en base à la première correction, puisque le dialogue
     * renvoie le montant affiché. Le passé cessait d'être le passé.
     *
     * Le tarif courant ne sert donc qu'aux périodes PAS ENCORE réglées.
     */
    const montantDu = reglement?.montant_du ?? due.montant_du
    const montantRecu = reglement?.montant_recu ?? 0

    return {
      inscription_id: due.inscription_id,
      mois: due.mois,
      session_id: due.session_id,
      montant_du: montantDu,
      montant_recu: montantRecu,
      statut: statutDe(montantDu, montantRecu, due.mois, due.session_id),
      reglement,
      horsPeriode: false,
    }
  })

  for (const reglement of reglementsExistants) {
    const cle = clePeriode(reglement)
    if (utilisees.has(cle)) continue

    lignes.push({
      inscription_id: reglement.inscription_id,
      mois: reglement.mois,
      session_id: reglement.session_id,
      montant_du: reglement.montant_du,
      montant_recu: reglement.montant_recu,
      statut: statutDe(
        reglement.montant_du,
        reglement.montant_recu,
        reglement.mois,
        reglement.session_id
      ),
      reglement,
      horsPeriode: true,
    })
  }

  return lignes
}

/** Ce qui reste à encaisser sur un ensemble de lignes. */
export function totauxReglements(lignes: readonly LigneReglement[]): {
  du: number
  recu: number
  reste: number
} {
  const du = lignes.reduce((total, ligne) => total + ligne.montant_du, 0)
  const recu = lignes.reduce((total, ligne) => total + ligne.montant_recu, 0)

  // Jamais négatif : un trop-perçu sur une ligne ne doit pas effacer le dû d'une
  // autre, sans quoi le total afficherait « rien à encaisser » alors qu'il reste
  // des impayés.
  const reste = lignes.reduce(
    (total, ligne) => total + Math.max(0, ligne.montant_du - ligne.montant_recu),
    0
  )

  return { du, recu, reste }
}

/* ==========================================================================
 * L'ASSEMBLAGE DE L'ÉCRAN
 *
 * Extrait du hook pour être ÉPROUVABLE : c'est de la logique sur de l'argent, et
 * elle décidait de trois choses qu'aucun test ne pouvait voir — quelle ligne est
 * réellement « sans tarif », quel dû s'affiche, et ce qui reste invisible après
 * une bascule de mode. Le hook ne fait plus que collecter les données.
 * ========================================================================== */

/** Une inscription, plus ce que l'écran doit en montrer. */
export interface InscriptionAffichable extends InscriptionFacturable {
  apprenant: string
  cours_libelle: string
  devise: string
}

export interface LigneAffichable<T extends ReglementRapprochable = ReglementRapprochable>
  extends LigneReglement<T> {
  apprenant: string
  cours_libelle: string
  devise: string
  /**
   * `true` **seulement** quand le tarif du mode actif est absent — jamais parce
   * que la période ne concerne pas cette personne.
   */
  tarifManquant: boolean
}

export interface Facturation<T extends ReglementRapprochable = ReglementRapprochable> {
  lignes: LigneAffichable<T>[]
  totaux: { du: number; recu: number; reste: number }
  /** Ce qui a été encaissé dans l'AUTRE mode, et que cet écran n'affiche pas. */
  autreMode: { nombre: number; recu: number }
}

/** Le tarif du mode actif, ou `null` s'il n'a pas été saisi. */
function tarifDuMode(inscription: InscriptionFacturable, mode: ModeFacturation): number | null {
  return mode === 'mensuel' ? inscription.prix_mensuel : inscription.prix_session
}

/**
 * Assemble le tableau d'une période : les lignes, leurs totaux, et ce qui reste
 * hors champ.
 *
 * En mensuel, `mois` est la période affichée ; au forfait, c'est la session — il
 * n'y en a qu'une, et `mois` ne sert alors qu'à borner le calcul.
 */
export function assemblerFacturation<T extends ReglementRapprochable>(
  inscriptions: readonly InscriptionAffichable[],
  reglements: readonly T[],
  mode: ModeFacturation,
  mois: string,
  contexte: ContexteStatut
): Facturation<T> {
  const dues = inscriptions.flatMap((une) => {
    const periodes = genererPeriodesDues(une, mode, mois)

    // En mensuel on n'affiche que le mois consulté ; au forfait, l'unique
    // période de la session. Filtrer coûte moins cher qu'un second chemin de
    // calcul à côté de celui qui est déjà éprouvé.
    return mode === 'mensuel' ? periodes.filter((due) => due.mois === mois) : periodes
  })

  const parInscription = new Map(inscriptions.map((une) => [une.id, une]))

  const dansLaPeriode = (reglement: T): boolean =>
    mode === 'mensuel' ? reglement.mois === mois : reglement.session_id !== null

  const pertinents = reglements.filter(
    (reglement) => parInscription.has(reglement.inscription_id) && dansLaPeriode(reglement)
  )

  const decorer = (ligne: LigneReglement<T>): LigneAffichable<T> => {
    const une = parInscription.get(ligne.inscription_id)

    return {
      ...ligne,
      apprenant: une?.apprenant ?? 'Apprenant retiré',
      cours_libelle: une?.cours_libelle ?? 'Cours supprimé',
      devise: une?.devise ?? 'XOF',
      tarifManquant: false,
    }
  }

  const lignes = fusionnerReglements(dues, pertinents, contexte).map(decorer)

  /*
   * ⚠️ « Aucun tarif saisi » ne se déduit PAS de l'absence de période.
   *
   * `genererPeriodesDues` rend une liste vide dans trois cas : l'apprenant est
   * arrivé APRÈS le mois consulté, son cours s'est terminé AVANT, ou le tarif
   * manque. Les confondre faisait accuser le mauvais coupable — quelqu'un arrivé
   * en mars s'affichait « sans tarif » sur février, bouton désactivé, alors que
   * son tarif était saisi. On ne signale donc que le vrai manque ; les autres ne
   * sont simplement pas facturés cette période-là, ce qui est la vérité.
   */
  const couvertes = new Set(lignes.map((ligne) => ligne.inscription_id))

  for (const une of inscriptions) {
    if (couvertes.has(une.id)) continue
    if (tarifDuMode(une, mode) !== null) continue

    lignes.push({
      inscription_id: une.id,
      mois: mode === 'mensuel' ? mois : null,
      session_id: mode === 'mensuel' ? null : (une.session?.id ?? null),
      montant_du: 0,
      montant_recu: 0,
      statut: 'attente',
      reglement: null,
      horsPeriode: false,
      apprenant: une.apprenant,
      cours_libelle: une.cours_libelle,
      devise: une.devise,
      tarifManquant: true,
    })
  }

  /*
   * ⚠️ Ce que cet écran n'affiche pas, il doit pouvoir le DIRE. Les règlements
   * de l'autre forme de période ne sont montrés nulle part : un centre qui a
   * encaissé des forfaits puis est revenu au mois ne les reverrait jamais, alors
   * que les réglages promettent qu'ils « restent modifiables ». On les compte
   * sans les mélanger aux totaux — additionner un forfait et des mois donnerait
   * un chiffre qui ne veut rien dire.
   */
  const autres = reglements.filter(
    (reglement) => parInscription.has(reglement.inscription_id) && !dansLaPeriode(reglement)
  )

  const facturees = lignes.filter((ligne) => !ligne.tarifManquant)

  return {
    lignes,
    totaux: totauxReglements(facturees),
    autreMode: {
      nombre: autres.length,
      recu: autres.reduce((total, reglement) => total + reglement.montant_recu, 0),
    },
  }
}

/** `AAAA-MM-JJ` du jour, en heure LOCALE — jamais `toISOString()`, qui est UTC. */
export function dateLocale(maintenant = new Date()): string {
  const mois = String(maintenant.getMonth() + 1).padStart(2, '0')
  const jour = String(maintenant.getDate()).padStart(2, '0')

  return `${maintenant.getFullYear()}-${mois}-${jour}`
}
