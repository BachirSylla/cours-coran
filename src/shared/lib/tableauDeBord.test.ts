import { describe, expect, it } from 'vitest'

import {
  alertes,
  assemblerTableauDeBord,
  chiffresArgent,
  chiffresAssiduite,
  chiffresPedagogie,
  encaissementsParMois,
  impayes,
  joursEntre,
  renouvellement,
  resumeParEnseignant,
  type EntreesTableauDeBord,
  type EtatPourAlertes,
  type LigneNommee,
  type OccurrenceComptable,
} from '@/shared/lib/tableauDeBord'

/**
 * Les chiffres du tableau de bord.
 *
 * C'est l'écran le plus regardé et le moins vérifié : personne n'ouvre un cours
 * pour recompter ce qu'il annonce. Une erreur ici ne plante pas, elle ment.
 */

const AUJOURDHUI = '2026-03-15'

function occurrence(extra: Partial<OccurrenceComptable> = {}): OccurrenceComptable {
  return {
    cours_id: 'c1',
    date: '2026-03-10',
    heure_debut: '10:00',
    saisie: true,
    statut: 'faite',
    ...extra,
  }
}

describe('chiffresPedagogie', () => {
  it('compte les séances tenues et celles qui restent à saisir', () => {
    const chiffres = chiffresPedagogie(
      [
        occurrence({ date: '2026-03-02' }),
        occurrence({ date: '2026-03-09', saisie: false, statut: null }),
        occurrence({ date: '2026-03-12', statut: 'annulee' }),
      ],
      AUJOURDHUI
    )

    expect(chiffres.aNoter).toBe(1)
    expect(chiffres.seancesTenues).toBe(1)
    expect(chiffres.plusAncienneANoter).toBe('2026-03-09')
  })

  /*
   * ⚠️ Une séance de la semaine prochaine n'est PAS en retard. La compter
   * mettrait tout centre en alerte permanente, et l'alerte cesserait d'être lue.
   */
  it('ne réclame jamais une séance à venir', () => {
    const chiffres = chiffresPedagogie(
      [occurrence({ date: '2026-03-20', saisie: false, statut: null })],
      AUJOURDHUI
    )

    expect(chiffres.aNoter).toBe(0)
    expect(chiffres.aVenir).toBe(1)
  })

  it('compte la séance du jour comme passée', () => {
    const chiffres = chiffresPedagogie(
      [occurrence({ date: AUJOURDHUI, saisie: false, statut: null })],
      AUJOURDHUI
    )

    expect(chiffres.aNoter).toBe(1)
  })

  it('ne compte comme tenue que ce qui a réellement eu lieu', () => {
    const chiffres = chiffresPedagogie(
      [
        occurrence({ statut: 'annulee' }),
        occurrence({ statut: 'reportee' }),
        occurrence({ statut: 'absence' }),
      ],
      AUJOURDHUI
    )

    expect(chiffres.seancesTenues).toBe(0)
  })

  it('ne plante pas sur un centre neuf', () => {
    expect(chiffresPedagogie([], AUJOURDHUI)).toEqual({
      aNoter: 0,
      plusAncienneANoter: null,
      seancesTenues: 0,
      aVenir: 0,
    })
  })
})

describe('chiffresAssiduite', () => {
  it('compte chaque état, présence partielle comprise', () => {
    const chiffres = chiffresAssiduite([
      { present: true, etat: 'present' },
      { present: true, etat: 'retard' },
      { present: false, etat: 'absent' },
      { present: false, etat: 'excuse' },
      { present: true, etat: 'partiel' },
    ])

    expect(chiffres).toMatchObject({ present: 1, retard: 1, absent: 1, excuse: 1, partiel: 1 })
    expect(chiffres.total).toBe(5)
    // Présent + retard + partiel comptent comme venus : 3 sur 5.
    expect(chiffres.taux).toBe(60)
  })

  /*
   * `etat` nul retombe sur le booléen, comme partout ailleurs (CLAUDE.md §4) :
   * les pointages antérieurs à 0008 doivent rester correctement comptés.
   */
  it('retombe sur le booléen quand l’état n’est pas renseigné', () => {
    const chiffres = chiffresAssiduite([
      { present: true, etat: null },
      { present: false, etat: null },
    ])

    expect(chiffres.present).toBe(1)
    expect(chiffres.absent).toBe(1)
    expect(chiffres.taux).toBe(50)
  })

  /*
   * ⚠️ L'ÉTAT VIDE. Un centre neuf ne doit pas lire « 0 % d'assiduité » — un
   * reproche adressé à des gens qui n'ont encore rien manqué — et surtout aucune
   * division par zéro.
   */
  it('rend `null` plutôt que zéro quand rien n’a été pointé', () => {
    const chiffres = chiffresAssiduite([])

    expect(chiffres.total).toBe(0)
    expect(chiffres.taux).toBeNull()
  })

  it('ignore un état inconnu sans se casser', () => {
    const chiffres = chiffresAssiduite([{ present: true, etat: 'inventé' }])

    expect(chiffres.total).toBe(0)
    expect(chiffres.taux).toBeNull()
  })
})

function ligne(extra: Partial<LigneNommee> = {}): LigneNommee {
  return {
    inscription_id: 'i1',
    apprenant_id: 'a1',
    apprenant: 'Aïcha Diallo',
    cours_libelle: 'Groupe Hifz',
    devise: 'XOF',
    tarifManquant: false,
    mois: '2026-03',
    session_id: null,
    montant_du: 15000,
    montant_recu: 0,
    statut: 'retard',
    reglement: null,
    horsPeriode: false,
    ...extra,
  }
}

describe('chiffresArgent', () => {
  it('additionne le dû, l’encaissé et le reste', () => {
    const chiffres = chiffresArgent([
      ligne({ montant_recu: 15000, statut: 'paye' }),
      ligne({ montant_recu: 5000, statut: 'partiel' }),
    ])

    expect(chiffres).toMatchObject({ du: 30000, encaisse: 20000, reste: 10000 })
    expect(chiffres.recouvrement).toBe(67)
  })

  /*
   * ⚠️ Un trop-perçu sur une ligne ne doit pas effacer l'impayé d'une autre :
   * le tableau annoncerait « rien à encaisser » alors qu'un apprenant n'a rien
   * versé. Le reste se calcule ligne par ligne, borné à zéro.
   */
  it('ne laisse pas un trop-perçu masquer un impayé', () => {
    const chiffres = chiffresArgent([
      ligne({ montant_du: 10000, montant_recu: 20000, statut: 'paye' }),
      ligne({ montant_du: 10000, montant_recu: 0, statut: 'retard' }),
    ])

    expect(chiffres.reste).toBe(10000)
  })

  it('rend `null` plutôt que 0 % quand rien n’est facturé', () => {
    expect(chiffresArgent([]).recouvrement).toBeNull()
    expect(chiffresArgent([]).reste).toBe(0)
  })
})

function nommee(extra: Partial<LigneNommee> = {}): LigneNommee {
  return { ...ligne(), ...extra }
}

describe('impayes', () => {
  it('ne retient que ce qui n’est pas soldé', () => {
    const liste = impayes(
      [
        nommee({ montant_recu: 15000, statut: 'paye' }),
        nommee({ inscription_id: 'i2', apprenant: 'Omar Ndiaye', montant_recu: 5000 }),
      ],
      () => 'mars 2026'
    )

    expect(liste).toHaveLength(1)
    expect(liste[0]).toMatchObject({ apprenant: 'Omar Ndiaye', reste: 10000 })
  })

  it('classe les retards d’abord, puis les plus gros montants', () => {
    const liste = impayes(
      [
        nommee({ inscription_id: 'a', apprenant: 'Attente', statut: 'attente' }),
        nommee({ inscription_id: 'b', apprenant: 'Petit retard', montant_du: 5000 }),
        nommee({ inscription_id: 'c', apprenant: 'Gros retard', montant_du: 50000 }),
      ],
      () => 'mars 2026'
    )

    expect(liste.map((impaye) => impaye.apprenant)).toEqual([
      'Gros retard',
      'Petit retard',
      'Attente',
    ])
  })

  /*
   * ⚠️ Une ligne sans tarif n'a aucun montant. L'afficher comme un impayé
   * accuserait quelqu'un de ne pas avoir payé une somme que personne ne lui a
   * jamais demandée.
   */
  it('écarte les lignes sans tarif', () => {
    const liste = impayes([nommee({ tarifManquant: true, montant_du: 0 })], () => 'mars 2026')

    expect(liste).toEqual([])
  })

  it('ne plante pas sur une liste vide', () => {
    expect(impayes([], () => '')).toEqual([])
  })
})

describe('encaissementsParMois', () => {
  it('rend une série continue, du plus ancien au plus récent', () => {
    const serie = encaissementsParMois([], '2026-03', 4)

    expect(serie.map((point) => point.mois)).toEqual([
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
    ])
  })

  /*
   * ⚠️ Un mois sans encaissement vaut zéro et RESTE présent : le retirer
   * tasserait la courbe et ferait croire à une régularité qui n'existe pas.
   */
  it('garde les mois vides à zéro', () => {
    const serie = encaissementsParMois(
      [{ date_paiement: '2026-03-04', mois: '2026-03', montant_recu: 15000 }],
      '2026-03',
      3
    )

    expect(serie.map((point) => point.montant)).toEqual([0, 0, 15000])
  })

  /*
   * C'est une TRÉSORERIE : le mois retenu est celui du règlement effectif, pas
   * celui qu'il couvre. Un rattrapage de janvier versé en mars se voit en mars.
   */
  it('place le règlement au mois où il a été reçu', () => {
    const serie = encaissementsParMois(
      [{ date_paiement: '2026-03-04', mois: '2026-01', montant_recu: 15000 }],
      '2026-03',
      3
    )

    expect(serie.find((point) => point.mois === '2026-03')!.montant).toBe(15000)
    expect(serie.find((point) => point.mois === '2026-01')!.montant).toBe(0)
  })

  it('retombe sur la période couverte quand la date manque', () => {
    const serie = encaissementsParMois(
      [{ date_paiement: null, mois: '2026-02', montant_recu: 9000 }],
      '2026-03',
      3
    )

    expect(serie.find((point) => point.mois === '2026-02')!.montant).toBe(9000)
  })

  it('ignore un forfait sans date ni mois plutôt que de le placer au hasard', () => {
    const serie = encaissementsParMois(
      [{ date_paiement: null, mois: null, montant_recu: 120000 }],
      '2026-03',
      3
    )

    expect(serie.every((point) => point.montant === 0)).toBe(true)
  })

  it('ignore un règlement hors fenêtre', () => {
    const serie = encaissementsParMois(
      [{ date_paiement: '2020-01-01', mois: '2020-01', montant_recu: 999 }],
      '2026-03',
      3
    )

    expect(serie.every((point) => point.montant === 0)).toBe(true)
  })
})

describe('joursEntre', () => {
  it('compte les jours sans se laisser décaler par un fuseau', () => {
    expect(joursEntre('2026-03-01', '2026-03-15')).toBe(14)
    expect(joursEntre('2026-03-15', '2026-03-01')).toBe(-14)
    expect(joursEntre('2026-03-15', '2026-03-15')).toBe(0)
  })

  it('traverse les mois et les années', () => {
    expect(joursEntre('2025-12-31', '2026-01-01')).toBe(1)
    expect(joursEntre('2026-02-28', '2026-03-01')).toBe(1)
  })
})

function etat(extra: Partial<EtatPourAlertes> = {}): EtatPourAlertes {
  return {
    aNoter: 0,
    plusAncienneANoter: null,
    conflits: 0,
    finSession: null,
    nomSession: 'Session 18',
    sessionTerminee: false,
    coursSansEnseignant: 0,
    coursSansTarif: 0,
    coursSansInscrit: 0,
    voitArgent: true,
    ...extra,
  }
}

describe('alertes', () => {
  it('ne dit rien quand tout va bien', () => {
    expect(alertes(etat(), AUJOURDHUI)).toEqual([])
  })

  /*
   * La gravité vient de l'ANCIENNETÉ, pas du nombre : une séance oubliée depuis
   * trois semaines est plus urgente que dix oubliées hier.
   */
  it('gradue les séances à noter selon leur ancienneté', () => {
    const recent = alertes(etat({ aNoter: 10, plusAncienneANoter: '2026-03-14' }), AUJOURDHUI)
    const vieux = alertes(etat({ aNoter: 1, plusAncienneANoter: '2026-02-20' }), AUJOURDHUI)

    expect(recent[0]!.gravite).toBe('info')
    expect(vieux[0]!.gravite).toBe('urgent')
  })

  it('classe l’urgent en premier', () => {
    const liste = alertes(
      etat({ coursSansInscrit: 1, conflits: 1, coursSansEnseignant: 1 }),
      AUJOURDHUI
    )

    expect(liste.map((alerte) => alerte.gravite)).toEqual(['urgent', 'attention', 'info'])
  })

  /*
   * ⚠️ LA SESSION PERPÉTUELLE. C'est celle que le backfill de 0022 pose à tout
   * centre qui n'utilise pas les sessions — donc le cas le plus courant. Elle ne
   * se termine jamais : l'alerter reviendrait à l'alerter chaque jour, pour rien.
   */
  it('ne prédit aucune fin à une session perpétuelle', () => {
    const liste = alertes(etat({ finSession: null }), AUJOURDHUI)

    expect(liste.find((alerte) => alerte.cle.startsWith('session-'))).toBeUndefined()
  })

  it('annonce une fin proche, et une seule fois', () => {
    const liste = alertes(etat({ finSession: '2026-03-25' }), AUJOURDHUI)

    expect(liste).toHaveLength(1)
    expect(liste[0]!.titre).toMatch(/se termine dans 10 jours/)
  })

  it('se tait quand la fin est encore loin', () => {
    expect(alertes(etat({ finSession: '2026-09-30' }), AUJOURDHUI)).toEqual([])
  })

  it('signale une date de fin dépassée', () => {
    const liste = alertes(etat({ finSession: '2026-02-01' }), AUJOURDHUI)

    expect(liste[0]!.cle).toBe('session-depassee')
  })

  it('se tait sur une session déjà clôturée', () => {
    expect(alertes(etat({ finSession: '2026-02-01', sessionTerminee: true }), AUJOURDHUI)).toEqual(
      []
    )
  })

  /*
   * ⚠️ LA FRONTIÈRE. Le tarif est une affaire de responsable : un enseignant ne
   * peut rien y faire et n'a pas à connaître les prix du centre.
   */
  it('tait les alertes d’argent à qui ne voit pas l’argent', () => {
    const responsable = alertes(etat({ coursSansTarif: 2 }), AUJOURDHUI)
    const enseignant = alertes(etat({ coursSansTarif: 2, voitArgent: false }), AUJOURDHUI)

    expect(responsable.some((alerte) => alerte.cle === 'cours-sans-tarif')).toBe(true)
    expect(enseignant.some((alerte) => alerte.cle === 'cours-sans-tarif')).toBe(false)
  })

  it('garde les alertes pédagogiques pour tout le monde', () => {
    const liste = alertes(
      etat({ voitArgent: false, aNoter: 3, plusAncienneANoter: '2026-03-14', conflits: 1 }),
      AUJOURDHUI
    )

    expect(liste.map((alerte) => alerte.cle)).toEqual(['conflits', 'seances-a-noter'])
  })
})

describe('resumeParEnseignant', () => {
  const nomDe = (userId: string | null) => (userId === null ? 'Sans enseignant' : `M. ${userId}`)

  it('regroupe cours, apprenants et séances à saisir', () => {
    const resume = resumeParEnseignant(
      [
        { id: 'c1', enseignant_id: 'u1', inscrits: 5 },
        { id: 'c2', enseignant_id: 'u1', inscrits: 3 },
      ],
      new Map([
        ['c1', 2],
        ['c2', 1],
      ]),
      nomDe
    )

    expect(resume).toHaveLength(1)
    expect(resume[0]).toMatchObject({ cours: 2, apprenants: 8, aNoter: 3 })
  })

  /*
   * Un cours sans enseignant forme sa propre ligne plutôt que de disparaître :
   * ce sont précisément ceux dont personne ne s'occupe.
   */
  it('range les cours orphelins en dernier, sans les perdre', () => {
    const resume = resumeParEnseignant(
      [
        { id: 'c1', enseignant_id: null, inscrits: 4 },
        { id: 'c2', enseignant_id: 'u1', inscrits: 1 },
      ],
      new Map(),
      nomDe
    )

    expect(resume.map((ligne) => ligne.user_id)).toEqual(['u1', null])
  })

  it('met en tête celui qui a le plus de retard', () => {
    const resume = resumeParEnseignant(
      [
        { id: 'c1', enseignant_id: 'u1', inscrits: 1 },
        { id: 'c2', enseignant_id: 'u2', inscrits: 1 },
      ],
      new Map([['c2', 5]]),
      nomDe
    )

    expect(resume[0]!.user_id).toBe('u2')
  })

  it('ne plante pas sans cours', () => {
    expect(resumeParEnseignant([], new Map(), nomDe)).toEqual([])
  })
})

describe('renouvellement', () => {
  /*
   * ⚠️ Par PERSONNE, pas par inscription. Quelqu'un qui passe de « Niveau 1 » à
   * « Niveau 2 » est REVENU — pas parti puis nouveau. C'est tout l'intérêt de
   * suivre l'identité de l'apprenant.
   */
  it('compte comme revenu celui qui a changé de niveau', () => {
    const bilan = renouvellement(new Set(['a', 'b', 'c']), new Set(['a', 'b', 'd']))

    expect(bilan).toEqual({ revenus: 2, partis: 1, nouveaux: 1, retention: 67 })
  })

  it('rend `null` plutôt que 0 % quand il n’y avait personne avant', () => {
    const bilan = renouvellement(new Set(), new Set(['a', 'b']))

    expect(bilan).toEqual({ revenus: 0, partis: 0, nouveaux: 2, retention: null })
  })

  it('supporte une session vide des deux côtés', () => {
    expect(renouvellement(new Set(), new Set())).toEqual({
      revenus: 0,
      partis: 0,
      nouveaux: 0,
      retention: null,
    })
  })

  it('voit un centre qui perd tout le monde', () => {
    expect(renouvellement(new Set(['a', 'b']), new Set())).toMatchObject({
      revenus: 0,
      partis: 2,
      retention: 0,
    })
  })
})

/* ==========================================================================
 * L'ASSEMBLAGE DE L'ÉCRAN
 *
 * Cette logique vivait dans le hook, que ce projet ne teste pas — le test de la
 * page mockait le hook entier, et ne vérifiait donc qu'une propriété de son
 * propre mock. Plusieurs bugs s'y cachaient ; chacun a son test ici.
 * ========================================================================== */

function entrees(extra: Partial<EntreesTableauDeBord> = {}): EntreesTableauDeBord {
  return {
    voitArgent: true,
    aujourdHui: AUJOURDHUI,
    lignes: [],
    reglementsRecents: [],
    moisFin: '2026-03',
    occurrences: [],
    pointages: [],
    cours: [],
    apprenantsMaintenant: new Set(),
    apprenantsAvant: new Set(),
    aUneSessionSource: false,
    conflits: 0,
    session: { nom: 'Session 18', date_fin: '2026-06-30', statut: 'en_cours' },
    nomPeriode: () => 'mars 2026',
    nomDe: (userId) => (userId === null ? 'Sans enseignant' : `M. ${userId}`),
    ...extra,
  }
}

describe('assemblerTableauDeBord', () => {
  /*
   * ⚠️ LA FRONTIÈRE, éprouvée là où elle se décide — et non sur une page à qui
   * l'on aurait passé `argent: null`.
   */
  it('ne calcule AUCUNE donnée d’argent pour qui n’y a pas droit', () => {
    const bord = assemblerTableauDeBord(
      entrees({
        voitArgent: false,
        lignes: [nommee({ montant_du: 15000, montant_recu: 0 })],
        reglementsRecents: [{ date_paiement: '2026-03-01', mois: '2026-03', montant_recu: 9000 }],
        cours: [{ id: 'c1', statut: 'actif', enseignant_id: null, inscrits: 0, sansTarif: true }],
      })
    )

    expect(bord.argent).toBeNull()
    expect(bord.impayes).toEqual([])
    expect(bord.encaissements).toEqual([])
    expect(bord.enseignants).toEqual([])
    expect(bord.alertes.map((alerte) => alerte.cle)).not.toContain('cours-sans-tarif')
    expect(bord.alertes.map((alerte) => alerte.cle)).not.toContain('cours-sans-inscrit')
  })

  /*
   * ⚠️ Une inscription sans tarif porte `montant_du: 0` et le statut « en
   * attente ». Comptée, elle faisait annoncer « Reste à encaisser 0 · 1 personne
   * concernée » juste au-dessus d'une carte disant « Tout est réglé ».
   */
  it('n’accuse personne pour un tarif qui n’a pas été saisi', () => {
    const bord = assemblerTableauDeBord(
      entrees({
        lignes: [
          nommee({ tarifManquant: true, montant_du: 0, montant_recu: 0, statut: 'attente' }),
        ],
      })
    )

    expect(bord.argent).toMatchObject({ du: 0, reste: 0, enRetard: 0 })
    expect(bord.impayes).toEqual([])
  })

  /*
   * ⚠️ « N personnes concernées » comptait des LIGNES. Quelqu'un inscrit à deux
   * cours était annoncé deux fois, sur l'écran qui sert justement à relancer.
   */
  it('compte des personnes, pas des lignes', () => {
    const bord = assemblerTableauDeBord(
      entrees({
        lignes: [
          nommee({ inscription_id: 'i1', apprenant_id: 'a1', montant_recu: 0 }),
          nommee({ inscription_id: 'i2', apprenant_id: 'a1', montant_recu: 0 }),
          nommee({ inscription_id: 'i3', apprenant_id: 'a2', montant_recu: 0 }),
        ],
      })
    )

    expect(bord.argent!.enRetard).toBe(2)
    // La liste, elle, reste par inscription : c'est ce qu'on va encaisser.
    expect(bord.impayes).toHaveLength(3)
  })

  /*
   * ⚠️ La courbe était toujours rendue, donc un centre neuf recevait six barres
   * vides et « Total 0 F CFA ». Six barres à zéro ne sont pas un graphe.
   */
  it('ne propose la courbe que s’il y a quelque chose à montrer', () => {
    expect(assemblerTableauDeBord(entrees()).aDesEncaissements).toBe(false)

    const avec = assemblerTableauDeBord(
      entrees({
        reglementsRecents: [{ date_paiement: '2026-03-04', mois: '2026-03', montant_recu: 9000 }],
      })
    )

    expect(avec.aDesEncaissements).toBe(true)
    expect(avec.encaissements).toHaveLength(6)
  })

  /*
   * ⚠️ « Apprenants actifs » comptait les inscrits de TOUS les cours de la
   * session, pause et terminés compris, pendant que la tuile annonçait juste à
   * côté le nombre de cours ACTIFS. Deux définitions dans la même tuile.
   */
  it('ne compte comme actifs que les cours actifs', () => {
    const bord = assemblerTableauDeBord(
      entrees({
        cours: [
          { id: 'c1', statut: 'actif', enseignant_id: 'u1', inscrits: 3, sansTarif: false },
          { id: 'c2', statut: 'pause', enseignant_id: 'u1', inscrits: 5, sansTarif: false },
          { id: 'c3', statut: 'termine', enseignant_id: 'u1', inscrits: 2, sansTarif: false },
        ],
        apprenantsMaintenant: new Set(['a1', 'a2', 'a3']),
      })
    )

    expect(bord.coursActifs).toBe(1)
    expect(bord.coursTermines).toBe(1)
    expect(bord.apprenantsActifs).toBe(3)
  })

  /*
   * ⚠️ Le dénominateur excluait les séances annulées : « 2 sur 10 » là où
   * quinze occurrences étaient passées.
   */
  it('compte toutes les occurrences passées comme dénominateur', () => {
    const bord = assemblerTableauDeBord(
      entrees({
        occurrences: [
          occurrence({ date: '2026-03-01', statut: 'faite' }),
          occurrence({ date: '2026-03-02', statut: 'annulee' }),
          occurrence({ date: '2026-03-03', saisie: false, statut: null }),
          occurrence({ date: '2026-03-20', saisie: false, statut: null }),
        ],
      })
    )

    expect(bord.seancesPassees).toBe(3)
    expect(bord.pedagogie.aNoter).toBe(1)
    expect(bord.pedagogie.seancesTenues).toBe(1)
  })

  /*
   * ⚠️ Le conflit est scopé par enseignant (§5.1), et l'intéressé est le premier
   * concerné : c'est lui qu'on attend à deux endroits. Le lui taire le laissait
   * découvrir le problème le jour même.
   */
  it('avertit du conflit d’horaire, responsable ou non', () => {
    for (const voitArgent of [true, false]) {
      const bord = assemblerTableauDeBord(entrees({ voitArgent, conflits: 1 }))

      expect(bord.alertes.map((alerte) => alerte.cle)).toContain('conflits')
    }
  })

  it('ne compare des sessions que lorsqu’il y a de quoi comparer', () => {
    expect(assemblerTableauDeBord(entrees()).renouvellement).toBeNull()

    const bord = assemblerTableauDeBord(
      entrees({
        aUneSessionSource: true,
        apprenantsAvant: new Set(['a1', 'a2']),
        apprenantsMaintenant: new Set(['a1', 'a3']),
      })
    )

    expect(bord.renouvellement).toEqual({ revenus: 1, partis: 1, nouveaux: 1, retention: 50 })
  })

  it('ne plante pas sur un centre entièrement vide', () => {
    const bord = assemblerTableauDeBord(entrees({ session: null }))

    expect(bord.argent).toMatchObject({ du: 0, encaisse: 0, reste: 0, recouvrement: null })
    expect(bord.assiduite.taux).toBeNull()
    expect(bord.alertes).toEqual([])
    expect(bord.apprenantsActifs).toBe(0)
    expect(bord.aDesEncaissements).toBe(false)
  })
})
