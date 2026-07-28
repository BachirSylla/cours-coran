/**
 * Logique mensuelle des paiements (CLAUDE.md §4, roadmap V2).
 *
 * Même principe que les séances : les mois dus sont **calculés au fil de l'eau**
 * à partir de la vie du cours et de son prix mensuel. Une ligne `paiement`
 * n'existe qu'une fois un règlement enregistré.
 *
 * Le **statut n'est jamais stocké** : il se déduit des montants et du mois. Une
 * colonne le figerait, et elle deviendrait fausse toute seule au passage d'un
 * mois — sans qu'aucune écriture n'ait eu lieu.
 *
 * Les mois sont des chaînes `AAAA-MM` comparées lexicographiquement : l'ordre
 * des chaînes est l'ordre chronologique, donc aucun objet `Date` n'intervient
 * et aucun décalage de fuseau n'est possible.
 *
 * Module **pur** : ni Supabase, ni React, ni DOM.
 */

export type StatutPaiement = 'paye' | 'partiel' | 'attente' | 'retard'

export const LIBELLES_STATUT_PAIEMENT: Record<StatutPaiement, string> = {
  paye: 'Payé',
  partiel: 'Partiel',
  attente: 'En attente',
  retard: 'En retard',
}

/** Ce dont le calcul a besoin pour facturer un cours. */
export interface CoursFacturable {
  id: string
  prix_mensuel: number | null
  date_debut: string
  date_fin: string | null
}

export interface MoisDu {
  cours_id: string
  /** Format `AAAA-MM`. */
  mois: string
  montant_du: number
}

/** Ce qu'une ligne enregistrée doit exposer pour être rapprochée d'un mois dû. */
export interface PaiementRapprochable {
  cours_id: string
  mois_concerne: string
  montant_du: number
  montant_recu: number
}

export interface LignePaiement<T extends PaiementRapprochable = PaiementRapprochable> {
  cours_id: string
  mois: string
  montant_du: number
  montant_recu: number
  statut: StatutPaiement
  /** La ligne enregistrée, ou `null` si aucun règlement n'a été saisi. */
  paiement: T | null
  /**
   * Règlement encaissé pour un mois qui n'est plus facturé (cours raccourci,
   * prix retiré). Conservé : on n'efface pas une recette.
   */
  horsPeriode: boolean
}

const FORMAT_MOIS = /^\d{4}-(0[1-9]|1[0-2])$/

export function estMoisValide(mois: string): boolean {
  return FORMAT_MOIS.test(mois)
}

/** `2026-07-28` → `2026-07`. */
export function moisDe(date: string): string {
  return date.slice(0, 7)
}

/** `2026-12` → `2027-01`. */
export function moisSuivant(mois: string): string {
  const [annee, numero] = mois.split('-').map(Number) as [number, number]

  return numero === 12 ? `${annee + 1}-01` : `${annee}-${String(numero + 1).padStart(2, '0')}`
}

/** `2027-01` → `2026-12`. */
export function moisPrecedent(mois: string): string {
  const [annee, numero] = mois.split('-').map(Number) as [number, number]

  return numero === 1 ? `${annee - 1}-12` : `${annee}-${String(numero - 1).padStart(2, '0')}`
}

/** Mois de la date du jour, en heure locale. */
export function moisCourant(maintenant = new Date()): string {
  return `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Un dû par mois, du mois de `date_debut` inclus jusqu'au plus tôt entre le mois
 * de `date_fin` et `moisMax`, inclus.
 *
 * Pas de prorata : `prix_mensuel` est un forfait, un mois entamé est un mois dû.
 * Un cours sans prix ne produit rien. La fonction ne regarde pas le `statut` du
 * cours : décider lesquels facturer appartient à l'appelant.
 */
export function genererMoisDus(cours: CoursFacturable, moisMax: string): MoisDu[] {
  if (cours.prix_mensuel === null) return []

  const premier = moisDe(cours.date_debut)
  const moisFinCours = cours.date_fin === null ? null : moisDe(cours.date_fin)
  const dernier = moisFinCours !== null && moisFinCours < moisMax ? moisFinCours : moisMax

  if (premier > dernier) return []

  const dus: MoisDu[] = []

  for (let mois = premier; mois <= dernier; mois = moisSuivant(mois)) {
    dus.push({ cours_id: cours.id, mois, montant_du: cours.prix_mensuel })
  }

  return dus
}

/**
 * Statut dérivé d'un mois. Le **mois courant est en attente, jamais en retard** :
 * on ne réclame pas un mois qui n'est pas terminé (CLAUDE.md §5.5 — la partie
 * financière reste consultable, sans relance).
 */
export function statutPaiement(
  montantDu: number,
  montantRecu: number,
  mois: string,
  courant: string
): StatutPaiement {
  if (montantRecu >= montantDu) return 'paye'
  if (montantRecu > 0) return 'partiel'

  return mois < courant ? 'retard' : 'attente'
}

/** Clé de rapprochement d'un mois dû : `cours_id|AAAA-MM`. */
export function clePaiement(element: { cours_id: string; mois: string }): string {
  return `${element.cours_id}|${element.mois}`
}

function comparerLignes(
  a: { mois: string; cours_id: string },
  b: { mois: string; cours_id: string }
) {
  return a.mois.localeCompare(b.mois) || a.cours_id.localeCompare(b.cours_id)
}

/**
 * Rapproche les mois dus des règlements enregistrés et calcule chaque statut.
 * Un règlement sans mois dû correspondant est conservé et marqué `horsPeriode`.
 */
export function fusionnerPaiements<T extends PaiementRapprochable>(
  moisDus: readonly MoisDu[],
  paiementsExistants: readonly T[],
  courant: string = moisCourant()
): LignePaiement<T>[] {
  const parCle = new Map<string, T>()
  for (const paiement of paiementsExistants) {
    parCle.set(
      clePaiement({ cours_id: paiement.cours_id, mois: paiement.mois_concerne }),
      paiement
    )
  }

  const clesUtilisees = new Set<string>()

  const lignes: LignePaiement<T>[] = moisDus.map((du) => {
    const cle = clePaiement(du)
    const paiement = parCle.get(cle) ?? null
    if (paiement) clesUtilisees.add(cle)

    const montantRecu = paiement?.montant_recu ?? 0

    return {
      cours_id: du.cours_id,
      mois: du.mois,
      montant_du: du.montant_du,
      montant_recu: montantRecu,
      statut: statutPaiement(du.montant_du, montantRecu, du.mois, courant),
      paiement,
      horsPeriode: false,
    }
  })

  for (const paiement of paiementsExistants) {
    const cle = clePaiement({ cours_id: paiement.cours_id, mois: paiement.mois_concerne })
    if (clesUtilisees.has(cle)) continue

    lignes.push({
      cours_id: paiement.cours_id,
      mois: paiement.mois_concerne,
      montant_du: paiement.montant_du,
      montant_recu: paiement.montant_recu,
      statut: statutPaiement(
        paiement.montant_du,
        paiement.montant_recu,
        paiement.mois_concerne,
        courant
      ),
      paiement,
      horsPeriode: true,
    })
    clesUtilisees.add(cle)
  }

  return lignes.sort(comparerLignes)
}

/** Totaux d'un ensemble de lignes — base du tableau de bord (V2-b). */
export function totaliser(lignes: readonly LignePaiement[]): {
  du: number
  recu: number
  reste: number
} {
  const du = lignes.reduce((somme, ligne) => somme + ligne.montant_du, 0)
  const recu = lignes.reduce((somme, ligne) => somme + ligne.montant_recu, 0)

  return { du, recu, reste: Math.max(0, du - recu) }
}

/** Nombre de lignes par statut — rangée de synthèse du tableau de bord. */
export function compterParStatut(
  lignes: readonly LignePaiement[]
): Record<StatutPaiement, number> {
  const compte: Record<StatutPaiement, number> = { paye: 0, partiel: 0, attente: 0, retard: 0 }

  for (const ligne of lignes) {
    compte[ligne.statut] += 1
  }

  return compte
}

/** Montant formaté avec sa devise, en convention française. */
export function formaterMontant(montant: number, devise = 'XOF'): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: devise,
    maximumFractionDigits: 2,
  }).format(montant)
}

/** `2026-07` → « juillet 2026 ». */
export function libelleMois(mois: string): string {
  const [annee, numero] = mois.split('-').map(Number) as [number, number]
  const libelle = new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(
    // Le jour 1 en heure locale : aucun risque de basculer sur le mois voisin.
    new Date(annee, numero - 1, 1)
  )

  return `${libelle} ${annee}`
}
