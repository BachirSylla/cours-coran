import type { LigneReglement } from '@/shared/lib/facturation'
import { moisDe, moisPrecedent, type StatutPaiement } from '@/shared/lib/paiements'

/**
 * Métriques du tableau de bord — module **pur** (ni Supabase, ni React, ni DOM).
 *
 * ⚠️ **Il ne recalcule jamais l'argent.** Tout ce qui touche aux montants entre
 * ici déjà calculé par `facturation.ts` : c'est la seule façon que le tableau de
 * bord et la page Paiements ne se contredisent jamais, et c'est ce qui préserve
 * l'invariant de 0026 — le dû d'une période réglée est celui qu'elle porte, pas
 * le tarif courant. Une agrégation SQL parallèle aurait créé une seconde source
 * de vérité sur l'argent ; c'est précisément ce que ce projet évite partout.
 *
 * Il ne connaît pas non plus les droits : c'est l'appelant qui décide de ne pas
 * lui passer d'argent quand le viewer n'y a pas droit. La RLS reste l'autorité —
 * un enseignant reçoit de toute façon zéro règlement de la base.
 */

/** Ce qu'une occurrence de séance doit exposer pour être comptée. */
export interface OccurrenceComptable {
  cours_id: string
  date: string
  heure_debut: string
  /** `false` quand l'occurrence n'a pas encore de ligne enregistrée. */
  saisie: boolean
  /** Statut de la ligne enregistrée, `null` si elle n'existe pas. */
  statut: string | null
}

export interface ChiffresPedagogie {
  /** Occurrences passées jamais saisies — le travail en retard. */
  aNoter: number
  /** La plus ancienne, `null` s'il n'y en a aucune. Sert à graduer l'alerte. */
  plusAncienneANoter: string | null
  seancesTenues: number
  /** Occurrences à venir dans la fenêtre observée. */
  aVenir: number
}

/**
 * Ce qui reste à saisir, et ce qui a été tenu.
 *
 * ⚠️ « À noter » ne compte que les occurrences **passées** : une séance de
 * jeudi prochain n'est pas en retard. La date du jour vient de l'appelant —
 * jamais de `new Date()` ici, pour que le module reste pur et testable.
 */
export function chiffresPedagogie(
  occurrences: readonly OccurrenceComptable[],
  aujourdHui: string
): ChiffresPedagogie {
  const passees = occurrences.filter((une) => une.date <= aujourdHui)
  const aNoter = passees.filter((une) => !une.saisie)

  return {
    aNoter: aNoter.length,
    plusAncienneANoter: aNoter.reduce<string | null>(
      (plusAncienne, une) =>
        plusAncienne === null || une.date < plusAncienne ? une.date : plusAncienne,
      null
    ),
    seancesTenues: passees.filter((une) => une.saisie && une.statut === 'faite').length,
    aVenir: occurrences.filter((une) => une.date > aujourdHui).length,
  }
}

export interface ChiffresAssiduite {
  present: number
  retard: number
  absent: number
  excuse: number
  partiel: number
  /** Pointages pris en compte. **Zéro quand rien n'a été saisi.** */
  total: number
  /**
   * Part de présence, en pourcentage entier — `null` quand aucun pointage
   * n'existe.
   *
   * ⚠️ `null`, jamais `0` : un centre neuf afficherait « 0 % d'assiduité »,
   * c'est-à-dire un reproche adressé à des gens qui n'ont encore rien manqué.
   * Et jamais de division par zéro.
   */
  taux: number | null
}

/** Un pointage, réduit à ce que le comptage regarde. */
export interface PointageComptable {
  present: boolean
  etat: string | null
}

/**
 * Assiduité globale.
 *
 * `etat` nul retombe sur le booléen `present`, comme partout ailleurs
 * (CLAUDE.md §4) : les pointages antérieurs à la migration 0008 restent
 * correctement comptés.
 *
 * Une présence **partielle** compte comme une présence pour ce taux : elle n'est
 * pénalisée nulle part dans le projet (§5.9), et l'écarter ferait baisser le
 * chiffre sans que personne comprenne pourquoi.
 */
export function chiffresAssiduite(
  pointages: readonly PointageComptable[]
): ChiffresAssiduite {
  const compte = { present: 0, retard: 0, absent: 0, excuse: 0, partiel: 0 }

  for (const pointage of pointages) {
    const etat = pointage.etat ?? (pointage.present ? 'present' : 'absent')
    if (etat in compte) compte[etat as keyof typeof compte] += 1
  }

  const total =
    compte.present + compte.retard + compte.absent + compte.excuse + compte.partiel

  return {
    ...compte,
    total,
    taux:
      total === 0
        ? null
        : Math.round(((compte.present + compte.retard + compte.partiel) / total) * 100),
  }
}

/** Ce dont le tableau de bord a besoin, au-delà des montants. */
export interface LigneNommee extends LigneReglement {
  /** L'identité de la personne — pour compter des gens, pas des lignes. */
  apprenant_id: string
  apprenant: string
  cours_libelle: string
  devise: string
  /** `true` quand aucun tarif n'est saisi : la ligne n'a alors aucun montant. */
  tarifManquant: boolean
}

export interface ChiffresArgent {
  encaisse: number
  /** Ce qui reste dû, jamais négatif : un trop-perçu n'efface pas un impayé. */
  reste: number
  du: number
  /** Part encaissée, `null` quand rien n'est facturé — pas `0 %`. */
  recouvrement: number | null
  /**
   * Combien de PERSONNES n'ont pas soldé — pas combien de lignes. Quelqu'un
   * inscrit à deux cours reste un apprenant, et l'annoncer deux fois donnerait
   * un chiffre plus gros que la réalité sur l'écran qui sert à relancer.
   */
  enRetard: number
}

/**
 * L'argent de la période affichée, à partir des lignes DÉJÀ calculées par
 * `facturation.ts`. Ce module n'applique aucun tarif : il additionne.
 *
 * ⚠️ L'appelant doit avoir ÉCARTÉ les lignes sans tarif. Elles portent
 * `montant_du: 0` et le statut « en attente » : comptées, elles produisaient
 * « Reste à encaisser 0 · 3 personnes concernées » juste au-dessus d'une carte
 * annonçant « Tout est réglé ». `assemblerTableauDeBord` s'en charge.
 */
export function chiffresArgent(lignes: readonly LigneNommee[]): ChiffresArgent {
  const du = lignes.reduce((total, ligne) => total + ligne.montant_du, 0)
  const encaisse = lignes.reduce((total, ligne) => total + ligne.montant_recu, 0)

  // Ligne par ligne, et borné à zéro : sinon un trop-perçu sur l'un masquerait
  // l'impayé d'un autre, et le total annoncerait « rien à encaisser ».
  const reste = lignes.reduce(
    (total, ligne) => total + Math.max(0, ligne.montant_du - ligne.montant_recu),
    0
  )

  return {
    encaisse,
    reste,
    du,
    recouvrement: du === 0 ? null : Math.round((encaisse / du) * 100),
    enRetard: new Set(
      lignes
        .filter((ligne) => ligne.montant_recu < ligne.montant_du)
        .map((ligne) => ligne.apprenant_id)
    ).size,
  }
}

/** Une ligne de la liste nominative « qui n'a pas payé ». */
export interface Impaye {
  inscription_id: string
  /** L'identité de la personne — une ligne par inscription, mais on compte des gens. */
  apprenant_id: string
  apprenant: string
  cours_libelle: string
  /** `AAAA-MM` ou le nom de la session — ce que l'écran affiche. */
  periode: string
  montant_du: number
  montant_recu: number
  reste: number
  devise: string
  statut: StatutPaiement
}

/**
 * Qui n'a pas soldé, du plus en retard au plus récent.
 *
 * ⚠️ Les lignes **sans tarif** sont écartées : elles n'ont aucun montant, et les
 * afficher comme des impayés accuserait quelqu'un de ne pas avoir payé une somme
 * que personne ne lui a jamais demandée.
 */
export function impayes(
  lignes: readonly LigneNommee[],
  nomPeriode: (ligne: LigneNommee) => string
): Impaye[] {
  const rang: Record<StatutPaiement, number> = { retard: 0, partiel: 1, attente: 2, paye: 3 }

  return lignes
    .filter((ligne) => !ligne.tarifManquant && ligne.montant_recu < ligne.montant_du)
    .map((ligne) => ({
      inscription_id: ligne.inscription_id,
      apprenant_id: ligne.apprenant_id,
      apprenant: ligne.apprenant,
      cours_libelle: ligne.cours_libelle,
      periode: nomPeriode(ligne),
      montant_du: ligne.montant_du,
      montant_recu: ligne.montant_recu,
      reste: ligne.montant_du - ligne.montant_recu,
      devise: ligne.devise,
      statut: ligne.statut,
    }))
    .sort(
      (a, b) =>
        rang[a.statut] - rang[b.statut] ||
        b.reste - a.reste ||
        a.apprenant.localeCompare(b.apprenant, 'fr')
    )
}

export interface PointEncaissement {
  mois: string
  montant: number
}

/** Ce qu'un règlement doit exposer pour être placé sur la courbe. */
export interface ReglementDate {
  date_paiement: string | null
  mois: string | null
  montant_recu: number
}

/**
 * Encaissements des `nombre` derniers mois, du plus ancien au plus récent.
 *
 * ⚠️ Un mois sans encaissement vaut **zéro et reste présent** : le retirer
 * tasserait la courbe et ferait croire à une régularité qui n'existe pas.
 *
 * Le mois retenu est celui du **règlement effectif** (`date_paiement`), pas celui
 * qu'il couvre : c'est une trésorerie, pas une comptabilité d'engagement. Sans
 * date de règlement — le responsable n'est pas obligé de la saisir — on retombe
 * sur la période couverte, faute de mieux ; un forfait sans date ne se place
 * alors nulle part.
 */
export function encaissementsParMois(
  reglements: readonly ReglementDate[],
  moisFin: string,
  nombre: number
): PointEncaissement[] {
  const serie: PointEncaissement[] = []
  let mois = moisFin

  for (let index = 0; index < nombre; index += 1) {
    serie.unshift({ mois, montant: 0 })
    mois = moisPrecedent(mois)
  }

  const parMois = new Map(serie.map((point) => [point.mois, point]))

  for (const reglement of reglements) {
    if (reglement.montant_recu <= 0) continue

    const cle = reglement.date_paiement !== null ? moisDe(reglement.date_paiement) : reglement.mois
    if (cle === null) continue

    const point = parMois.get(cle)
    if (point) point.montant += reglement.montant_recu
  }

  return serie
}

export type GraviteAlerte = 'info' | 'attention' | 'urgent'

export interface Alerte {
  cle: string
  gravite: GraviteAlerte
  titre: string
  detail: string
  /** Route à ouvrir, `null` quand il n'y a rien à corriger ailleurs. */
  lien: string | null
}

export interface EtatPourAlertes {
  aNoter: number
  plusAncienneANoter: string | null
  conflits: number
  /** Fin de la session active, `null` si elle est perpétuelle. */
  finSession: string | null
  nomSession: string
  sessionTerminee: boolean
  coursSansEnseignant: number
  coursSansTarif: number
  coursSansInscrit: number
  /** `false` pour un enseignant : les alertes d'argent lui sont tues. */
  voitArgent: boolean
}

/** Jours entre deux dates `AAAA-MM-JJ`, sans passer par un fuseau. */
export function joursEntre(depuis: string, jusqua: string): number {
  const [a1, m1, j1] = depuis.split('-').map(Number) as [number, number, number]
  const [a2, m2, j2] = jusqua.split('-').map(Number) as [number, number, number]

  return Math.round(
    (Date.UTC(a2, m2 - 1, j2) - Date.UTC(a1, m1 - 1, j1)) / 86_400_000
  )
}

/**
 * Ce qui demande une action, de la plus urgente à la moins pressante.
 *
 * Trois partis pris, pour que la liste reste lisible :
 *
 *   * **rien qui ne soit actionnable**. Une alerte qu'on ne peut pas résoudre
 *     s'apprend à ignorer, et emporte les autres avec elle ;
 *   * la gravité vient de l'ANCIENNETÉ, pas du nombre. Une séance oubliée depuis
 *     trois semaines est plus urgente que dix oubliées hier ;
 *   * ⚠️ **une session perpétuelle ne se termine jamais** : pas d'alerte de fin.
 *     C'est le cas de tout centre qui n'utilise pas les sessions, donc le cas le
 *     plus courant — l'alerter serait l'alerter tous les jours pour rien.
 */
export function alertes(etat: EtatPourAlertes, aujourdHui: string): Alerte[] {
  const liste: Alerte[] = []

  if (etat.aNoter > 0) {
    const retard =
      etat.plusAncienneANoter === null ? 0 : joursEntre(etat.plusAncienneANoter, aujourdHui)

    liste.push({
      cle: 'seances-a-noter',
      gravite: retard >= 14 ? 'urgent' : retard >= 7 ? 'attention' : 'info',
      titre:
        etat.aNoter === 1 ? '1 séance à renseigner' : `${etat.aNoter} séances à renseigner`,
      detail:
        retard >= 7
          ? `La plus ancienne attend depuis ${retard} jours.`
          : 'Elles ont eu lieu mais rien n’y a été saisi.',
      lien: '/seances',
    })
  }

  if (etat.conflits > 0) {
    liste.push({
      cle: 'conflits',
      gravite: 'urgent',
      titre:
        etat.conflits === 1
          ? '1 conflit d’horaire'
          : `${etat.conflits} conflits d’horaire`,
      detail: 'Un même enseignant est attendu à deux endroits en même temps.',
      lien: '/planning',
    })
  }

  /*
   * ⚠️ Une session sans date de fin ne se termine pas : c'est le cas de tout
   * centre qui n'utilise pas les sessions. Alerter là-dessus reviendrait à
   * alerter chaque jour, pour rien.
   */
  if (etat.finSession !== null && !etat.sessionTerminee) {
    const restants = joursEntre(aujourdHui, etat.finSession)

    if (restants < 0) {
      liste.push({
        cle: 'session-depassee',
        gravite: 'attention',
        titre: `« ${etat.nomSession} » a dépassé sa date de fin`,
        detail: 'Clôturez-la, ou repoussez sa date si elle continue.',
        lien: '/parametres',
      })
    } else if (restants <= 30) {
      liste.push({
        cle: 'session-se-termine',
        gravite: restants <= 7 ? 'attention' : 'info',
        titre:
          restants === 0
            ? `« ${etat.nomSession} » se termine aujourd’hui`
            : `« ${etat.nomSession} » se termine dans ${restants} jour${restants > 1 ? 's' : ''}`,
        detail: 'Pensez à ouvrir la suivante par reconduction.',
        lien: '/parametres',
      })
    }
  }

  if (etat.coursSansEnseignant > 0) {
    liste.push({
      cle: 'cours-sans-enseignant',
      gravite: 'attention',
      titre:
        etat.coursSansEnseignant === 1
          ? '1 cours sans enseignant'
          : `${etat.coursSansEnseignant} cours sans enseignant`,
      detail: 'Personne n’y saisira de séance tant qu’il n’est pas affecté.',
      lien: '/cours',
    })
  }

  // Le tarif est une affaire de responsable : on ne la montre pas à un
  // enseignant, qui ne peut rien y faire et n'a pas à connaître les prix.
  if (etat.voitArgent && etat.coursSansTarif > 0) {
    liste.push({
      cle: 'cours-sans-tarif',
      gravite: 'info',
      titre:
        etat.coursSansTarif === 1
          ? '1 cours sans tarif'
          : `${etat.coursSansTarif} cours sans tarif`,
      detail: 'Ils ne sont pas facturés dans le mode de facturation actif.',
      lien: '/cours',
    })
  }

  if (etat.coursSansInscrit > 0) {
    liste.push({
      cle: 'cours-sans-inscrit',
      gravite: 'info',
      titre:
        etat.coursSansInscrit === 1
          ? '1 cours sans inscrit'
          : `${etat.coursSansInscrit} cours sans inscrit`,
      detail: 'Aucun apprenant n’y est encore rattaché.',
      lien: '/cours',
    })
  }

  const ordre: Record<GraviteAlerte, number> = { urgent: 0, attention: 1, info: 2 }

  return liste.sort((a, b) => ordre[a.gravite] - ordre[b.gravite])
}

export interface ResumeEnseignant {
  user_id: string | null
  nom: string
  cours: number
  apprenants: number
  aNoter: number
}

/** Ce qu'un cours doit exposer pour entrer dans le résumé par enseignant. */
export interface CoursResumable {
  id: string
  enseignant_id: string | null
  inscrits: number
}

/**
 * Qui porte quoi. Les cours **sans enseignant** forment leur propre ligne plutôt
 * que de disparaître : ce sont précisément ceux dont personne ne s'occupe.
 */
export function resumeParEnseignant(
  cours: readonly CoursResumable[],
  aNoterParCours: ReadonlyMap<string, number>,
  nomDe: (userId: string | null) => string
): ResumeEnseignant[] {
  const parEnseignant = new Map<string | null, ResumeEnseignant>()

  for (const unCours of cours) {
    const cle = unCours.enseignant_id
    const ligne = parEnseignant.get(cle) ?? {
      user_id: cle,
      nom: nomDe(cle),
      cours: 0,
      apprenants: 0,
      aNoter: 0,
    }

    ligne.cours += 1
    ligne.apprenants += unCours.inscrits
    ligne.aNoter += aNoterParCours.get(unCours.id) ?? 0

    parEnseignant.set(cle, ligne)
  }

  return [...parEnseignant.values()].sort(
    (a, b) =>
      // Les orphelins en dernier : ce sont des cours, pas une personne.
      Number(a.user_id === null) - Number(b.user_id === null) ||
      b.aNoter - a.aNoter ||
      a.nom.localeCompare(b.nom, 'fr')
  )
}

export interface Renouvellement {
  /** Inscrits de la session précédente qu'on retrouve dans celle-ci. */
  revenus: number
  /** Inscrits de la session précédente absents de celle-ci. */
  partis: number
  /** Inscrits de cette session qui n'étaient pas dans la précédente. */
  nouveaux: number
  /** Part revenue, `null` quand la session précédente était vide. */
  retention: number | null
}

/**
 * Le renouvellement d'une session à l'autre, **par personne** — pas par
 * inscription.
 *
 * Quelqu'un qui passe de « Niveau 1 » à « Niveau 2 » est **revenu**, pas parti
 * puis nouveau : c'est tout l'intérêt de suivre l'identité de l'apprenant plutôt
 * que la ligne d'inscription. La correspondance entre les deux sessions vient de
 * `cours.reconduit_de` (migration 0024), résolue par l'appelant.
 *
 * Sans session précédente, tout le monde est « nouveau » et la rétention vaut
 * `null` : il n'y a rien à retenir, et afficher 0 % serait un mauvais bulletin
 * pour un centre qui vient d'ouvrir.
 */
export function renouvellement(
  apprenantsAvant: ReadonlySet<string>,
  apprenantsMaintenant: ReadonlySet<string>
): Renouvellement {
  let revenus = 0
  for (const apprenant of apprenantsMaintenant) {
    if (apprenantsAvant.has(apprenant)) revenus += 1
  }

  return {
    revenus,
    partis: apprenantsAvant.size - revenus,
    nouveaux: apprenantsMaintenant.size - revenus,
    retention: apprenantsAvant.size === 0 ? null : Math.round((revenus / apprenantsAvant.size) * 100),
  }
}

/* ==========================================================================
 * L'ASSEMBLAGE DE L'ÉCRAN
 *
 * Extrait du hook pour être ÉPROUVABLE. Ce projet ne teste pas les hooks : tant
 * que ces décisions y vivaient, le test de la page ne vérifiait qu'une propriété
 * de son propre mock — « une page à qui l'on passe `argent: null` n'affiche pas
 * d'argent ». Quatre bugs s'y cachaient, dont un qui annonçait « 0 F à
 * encaisser · 3 personnes concernées » juste au-dessus de « Tout est réglé ».
 * ========================================================================== */

/** Un cours, réduit à ce que le tableau de bord regarde. */
export interface CoursPourBord {
  id: string
  statut: string
  enseignant_id: string | null
  inscrits: number
  /** `true` quand aucun tarif n'est saisi pour le mode actif. */
  sansTarif: boolean
}

export interface EntreesTableauDeBord {
  /** Décide de tout ce qui touche à l'argent. La RLS reste l'autorité. */
  voitArgent: boolean
  aujourdHui: string
  /** Lignes de facturation déjà calculées par `facturation.ts`. */
  lignes: readonly LigneNommee[]
  /** Règlements des derniers mois, pour la courbe — indépendants de la période. */
  reglementsRecents: readonly ReglementDate[]
  moisFin: string
  occurrences: readonly OccurrenceComptable[]
  pointages: readonly PointageComptable[]
  cours: readonly CoursPourBord[]
  /** Apprenants distincts de la session, et de celle qu'elle reconduit. */
  apprenantsMaintenant: ReadonlySet<string>
  apprenantsAvant: ReadonlySet<string>
  /** `false` quand aucun cours n'a été reconduit : il n'y a rien à comparer. */
  aUneSessionSource: boolean
  conflits: number
  session: { nom: string; date_fin: string | null; statut: string } | null
  nomPeriode: (ligne: LigneNommee) => string
  nomDe: (userId: string | null) => string
}

export interface TableauDeBord {
  argent: ChiffresArgent | null
  impayes: Impaye[]
  encaissements: PointEncaissement[]
  /** `false` quand la courbe n'a que des zéros : on ne la montre pas. */
  aDesEncaissements: boolean
  pedagogie: ChiffresPedagogie
  /** Occurrences passées, toutes issues confondues — le dénominateur honnête. */
  seancesPassees: number
  assiduite: ChiffresAssiduite
  alertes: Alerte[]
  enseignants: ResumeEnseignant[]
  renouvellement: Renouvellement | null
  apprenantsActifs: number
  coursActifs: number
  coursTermines: number
}

/** Ce que l'écran affiche, à partir de ce qui a été lu. */
export function assemblerTableauDeBord(entrees: EntreesTableauDeBord): TableauDeBord {
  const actifs = entrees.cours.filter((unCours) => unCours.statut === 'actif')

  const pedagogie = chiffresPedagogie(entrees.occurrences, entrees.aujourdHui)

  const aNoterParCours = new Map<string, number>()
  for (const occurrence of entrees.occurrences) {
    if (occurrence.saisie || occurrence.date > entrees.aujourdHui) continue
    aNoterParCours.set(occurrence.cours_id, (aNoterParCours.get(occurrence.cours_id) ?? 0) + 1)
  }

  /*
   * ⚠️ Les lignes SANS tarif sortent avant tout calcul d'argent. Elles portent
   * `montant_du: 0` et le statut « en attente » : comptées, elles faisaient
   * annoncer « Reste à encaisser 0 · 3 personnes concernées » à un centre qui
   * n'avait simplement pas encore saisi ses prix — juste au-dessus d'une carte
   * disant « Tout est réglé ». `impayes()` les écartait déjà ; le compteur, non.
   */
  const facturees = entrees.lignes.filter((ligne) => !ligne.tarifManquant)

  const encaissements = entrees.voitArgent
    ? encaissementsParMois(entrees.reglementsRecents, entrees.moisFin, 6)
    : []

  return {
    argent: entrees.voitArgent ? chiffresArgent(facturees) : null,
    impayes: entrees.voitArgent ? impayes(entrees.lignes, entrees.nomPeriode) : [],
    encaissements,
    // Six barres à zéro ne sont pas un graphe, ce sont six barres à zéro.
    aDesEncaissements: encaissements.some((point) => point.montant > 0),

    pedagogie,
    seancesPassees: entrees.occurrences.filter((une) => une.date <= entrees.aujourdHui).length,
    assiduite: chiffresAssiduite(entrees.pointages),

    alertes: alertes(
      {
        aNoter: pedagogie.aNoter,
        plusAncienneANoter: pedagogie.plusAncienneANoter,
        // Le conflit concerne l'enseignant AUTANT que le responsable : c'est lui
        // qu'on attend à deux endroits. Le lui taire serait le laisser découvrir
        // le problème le jour même.
        conflits: entrees.conflits,
        finSession: entrees.session?.date_fin ?? null,
        nomSession: entrees.session?.nom ?? '',
        sessionTerminee: entrees.session?.statut === 'terminee',
        coursSansEnseignant: entrees.voitArgent
          ? actifs.filter((unCours) => unCours.enseignant_id === null).length
          : 0,
        coursSansTarif: actifs.filter((unCours) => unCours.sansTarif).length,
        coursSansInscrit: entrees.voitArgent
          ? actifs.filter((unCours) => unCours.inscrits === 0).length
          : 0,
        voitArgent: entrees.voitArgent,
      },
      entrees.aujourdHui
    ),

    enseignants: entrees.voitArgent
      ? resumeParEnseignant(
          actifs.map((unCours) => ({
            id: unCours.id,
            enseignant_id: unCours.enseignant_id,
            inscrits: unCours.inscrits,
          })),
          aNoterParCours,
          entrees.nomDe
        )
      : [],

    /*
     * ⚠️ Ce que cette mesure compare EXACTEMENT : les inscrits des cours de la
     * session, et ceux des cours qu'ils reconduisent. Ce n'est pas « la session
     * précédente » au sens large — un cours abandonné, non reconduit, ne
     * participe à aucun des deux ensembles, et quelqu'un qui n'en venait que de
     * là ressort « nouveau ». C'est le seul lien fiable dont dispose le schéma
     * (`cours.reconduit_de`, 0024), et l'écran le dit.
     */
    renouvellement: entrees.aUneSessionSource
      ? renouvellement(entrees.apprenantsAvant, entrees.apprenantsMaintenant)
      : null,

    apprenantsActifs: entrees.apprenantsMaintenant.size,
    coursActifs: actifs.length,
    coursTermines: entrees.cours.filter((unCours) => unCours.statut === 'termine').length,
  }
}
