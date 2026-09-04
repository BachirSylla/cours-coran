import { describe, expect, it } from 'vitest'

import {
  assemblerFacturation,
  clePeriode,
  dateLocale,
  fusionnerReglements,
  genererPeriodesDues,
  statutForfait,
  statutMois,
  totauxReglements,
  type ContexteStatut,
  type InscriptionAffichable,
  type InscriptionFacturable,
} from '@/shared/lib/facturation'

/**
 * Le calcul de « qui doit quoi », dans les deux modes.
 *
 * C'est de la logique métier sensible au sens de CLAUDE.md §9 : une erreur ici
 * ne plante pas, elle réclame de l'argent à quelqu'un qui ne doit rien, ou
 * l'inverse.
 */

const SESSION = { id: 's18', date_debut: '2026-01-05', date_fin: '2026-06-30' }

function inscription(extra: Partial<InscriptionFacturable> = {}): InscriptionFacturable {
  return {
    id: 'i1',
    apprenant_id: 'a1',
    cours_id: 'c1',
    inscrit_le: '2026-01-05',
    cours_debut: '2026-01-05',
    cours_fin: null,
    session: SESSION,
    prix_mensuel: 15000,
    prix_session: 120000,
    ...extra,
  }
}

const CONTEXTE: ContexteStatut = {
  moisCourant: '2026-04',
  aujourdHui: '2026-04-15',
  finDeSession: new Map([['s18', '2026-06-30']]),
}

describe('genererPeriodesDues — mode mensuel', () => {
  it('produit un dû par mois, du début du cours au mois courant', () => {
    const dues = genererPeriodesDues(inscription(), 'mensuel', '2026-04')

    expect(dues.map((due) => due.mois)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04'])
    expect(dues.every((due) => due.montant_du === 15000)).toBe(true)
    expect(dues.every((due) => due.session_id === null)).toBe(true)
  })

  /*
   * ⚠️ Le cas nommé par le propriétaire : quelqu'un qui arrive en mars ne doit
   * pas janvier et février. Et il doit mars ENTIER — pas de prorata, un mois
   * entamé est un mois dû.
   */
  it('démarre à l’arrivée de l’apprenant, sans jamais proratiser', () => {
    const dues = genererPeriodesDues(
      inscription({ inscrit_le: '2026-03-20' }),
      'mensuel',
      '2026-04'
    )

    expect(dues.map((due) => due.mois)).toEqual(['2026-03', '2026-04'])
    expect(dues[0]!.montant_du).toBe(15000)
  })

  it('ignore une arrivée antérieure au cours — le cours fait foi', () => {
    const dues = genererPeriodesDues(
      inscription({ inscrit_le: '2025-11-02' }),
      'mensuel',
      '2026-02'
    )

    expect(dues.map((due) => due.mois)).toEqual(['2026-01', '2026-02'])
  })

  it('s’arrête à la fin du cours quand elle précède le mois courant', () => {
    const dues = genererPeriodesDues(
      inscription({ cours_fin: '2026-02-20' }),
      'mensuel',
      '2026-04'
    )

    expect(dues.map((due) => due.mois)).toEqual(['2026-01', '2026-02'])
  })

  it('ne facture rien sans prix mensuel', () => {
    expect(genererPeriodesDues(inscription({ prix_mensuel: null }), 'mensuel', '2026-04')).toEqual(
      []
    )
  })

  it('ne facture rien à qui arrive après la fin du cours', () => {
    const dues = genererPeriodesDues(
      inscription({ inscrit_le: '2026-05-02', cours_fin: '2026-03-31' }),
      'mensuel',
      '2026-06'
    )

    expect(dues).toEqual([])
  })
})

describe('genererPeriodesDues — forfait par session', () => {
  it('produit exactement une période, celle de la session', () => {
    const dues = genererPeriodesDues(inscription(), 'par_session', '2026-04')

    expect(dues).toHaveLength(1)
    expect(dues[0]).toMatchObject({ mois: null, session_id: 's18', montant_du: 120000 })
  })

  /*
   * ⚠️ Le forfait ne se proratise pas davantage que le mois : rejoindre en avril
   * une session qui a commencé en janvier coûte le forfait entier. C'est une
   * décision produit, et le responsable peut toujours corriger le montant.
   */
  it('ne remise rien à qui rejoint en cours de session', () => {
    const dues = genererPeriodesDues(
      inscription({ inscrit_le: '2026-04-10' }),
      'par_session',
      '2026-04'
    )

    expect(dues).toHaveLength(1)
    expect(dues[0]!.montant_du).toBe(120000)
  })

  it('ne facture rien sans forfait renseigné', () => {
    expect(genererPeriodesDues(inscription({ prix_session: null }), 'par_session')).toEqual([])
  })

  it('ne facture rien si la session n’est pas lisible', () => {
    expect(genererPeriodesDues(inscription({ session: null }), 'par_session')).toEqual([])
  })

  /*
   * Le mode n'est pas une préférence d'affichage : il change ce qui est dû. Le
   * prix de l'autre mode ne doit jamais servir de repli — facturer 15 000 au
   * lieu de 120 000 passerait inaperçu jusqu'à la fin de la session.
   */
  it('n’emprunte jamais le tarif de l’autre mode', () => {
    expect(genererPeriodesDues(inscription({ prix_session: null }), 'par_session')).toEqual([])
    expect(genererPeriodesDues(inscription({ prix_mensuel: null }), 'mensuel')).toEqual([])
  })
})

describe('statutMois', () => {
  it('n’est jamais en retard sur le mois courant', () => {
    expect(statutMois(15000, 0, '2026-04', '2026-04')).toBe('attente')
    expect(statutMois(15000, 0, '2026-03', '2026-04')).toBe('retard')
  })

  it('distingue payé, partiel et trop-perçu', () => {
    expect(statutMois(15000, 15000, '2026-03', '2026-04')).toBe('paye')
    expect(statutMois(15000, 20000, '2026-03', '2026-04')).toBe('paye')
    expect(statutMois(15000, 1, '2026-03', '2026-04')).toBe('partiel')
  })
})

describe('statutForfait', () => {
  /*
   * ⚠️ Un forfait n'est PAS en retard dès le premier jour non payé : il l'est
   * quand la session est finie. Sans cela, tout le monde serait en rouge le
   * lundi de la rentrée, et l'écran ne dirait plus rien.
   */
  it('reste en attente tant que la session n’est pas terminée', () => {
    expect(statutForfait(120000, 0, '2026-06-30', '2026-04-15')).toBe('attente')
    expect(statutForfait(120000, 0, '2026-06-30', '2026-07-01')).toBe('retard')
  })

  it('ne passe jamais en retard sans date de fin', () => {
    expect(statutForfait(120000, 0, null, '2030-01-01')).toBe('attente')
  })

  it('distingue payé et partiel', () => {
    expect(statutForfait(120000, 120000, '2026-06-30', '2026-07-01')).toBe('paye')
    expect(statutForfait(120000, 50000, '2026-06-30', '2026-07-01')).toBe('partiel')
  })
})

describe('clePeriode', () => {
  it('ne confond jamais un mois et une session', () => {
    const parMois = clePeriode({ inscription_id: 'i1', mois: '2026-04', session_id: null })
    const parSession = clePeriode({ inscription_id: 'i1', mois: null, session_id: '2026-04' })

    expect(parMois).not.toBe(parSession)
  })
})

describe('fusionnerReglements', () => {
  it('rapproche chaque règlement de sa période et calcule le statut', () => {
    const dues = genererPeriodesDues(inscription(), 'mensuel', '2026-02')
    const lignes = fusionnerReglements(
      dues,
      [
        {
          inscription_id: 'i1',
          mois: '2026-01',
          session_id: null,
          montant_du: 15000,
          montant_recu: 15000,
        },
      ],
      CONTEXTE
    )

    expect(lignes.map((ligne) => ligne.statut)).toEqual(['paye', 'retard'])
    expect(lignes[0]!.reglement).not.toBeNull()
    expect(lignes[1]!.reglement).toBeNull()
  })

  /*
   * LE cas qui justifie le grain nominatif : deux inscrits du même cours, le
   * même mois. Sous l'ancien grain `(cours, mois)`, cette question n'avait pas
   * de réponse — il n'y avait qu'un total.
   */
  it('suit deux inscrits du même cours séparément', () => {
    const aicha = inscription({ id: 'i1', apprenant_id: 'a1' })
    const omar = inscription({ id: 'i2', apprenant_id: 'a2' })

    const dues = [
      ...genererPeriodesDues(aicha, 'mensuel', '2026-01'),
      ...genererPeriodesDues(omar, 'mensuel', '2026-01'),
    ]

    const lignes = fusionnerReglements(
      dues,
      [
        {
          inscription_id: 'i1',
          mois: '2026-01',
          session_id: null,
          montant_du: 15000,
          montant_recu: 15000,
        },
      ],
      { ...CONTEXTE, moisCourant: '2026-02' }
    )

    expect(lignes.find((ligne) => ligne.inscription_id === 'i1')!.statut).toBe('paye')
    expect(lignes.find((ligne) => ligne.inscription_id === 'i2')!.statut).toBe('retard')
  })

  /*
   * On n'efface pas une recette. Un cours raccourci, un tarif retiré, un
   * apprenant désinscrit : le règlement encaissé reste à l'écran, signalé.
   */
  it('conserve un règlement dont la période n’est plus facturée', () => {
    const lignes = fusionnerReglements(
      [],
      [
        {
          inscription_id: 'i1',
          mois: '2025-12',
          session_id: null,
          montant_du: 15000,
          montant_recu: 15000,
        },
      ],
      CONTEXTE
    )

    expect(lignes).toHaveLength(1)
    expect(lignes[0]!.horsPeriode).toBe(true)
    expect(lignes[0]!.statut).toBe('paye')
  })

  it('juge un forfait sur la fin de SA session', () => {
    const dues = genererPeriodesDues(inscription(), 'par_session')

    const enCours = fusionnerReglements(dues, [], CONTEXTE)
    expect(enCours[0]!.statut).toBe('attente')

    const apres = fusionnerReglements(dues, [], { ...CONTEXTE, aujourdHui: '2026-07-15' })
    expect(apres[0]!.statut).toBe('retard')
  })

  it('ne se trompe pas de session quand plusieurs coexistent', () => {
    const dues = [
      ...genererPeriodesDues(inscription({ id: 'i1' }), 'par_session'),
      ...genererPeriodesDues(
        inscription({
          id: 'i2',
          session: { id: 's17', date_debut: '2025-09-01', date_fin: '2025-12-31' },
        }),
        'par_session'
      ),
    ]

    const lignes = fusionnerReglements(dues, [], {
      ...CONTEXTE,
      finDeSession: new Map([
        ['s18', '2026-06-30'],
        ['s17', '2025-12-31'],
      ]),
    })

    expect(lignes.find((ligne) => ligne.session_id === 's18')!.statut).toBe('attente')
    expect(lignes.find((ligne) => ligne.session_id === 's17')!.statut).toBe('retard')
  })
})

describe('totauxReglements', () => {
  it('additionne le dû et le reçu', () => {
    const totaux = totauxReglements([
      {
        inscription_id: 'i1',
        mois: '2026-01',
        session_id: null,
        montant_du: 15000,
        montant_recu: 15000,
        statut: 'paye',
        reglement: null,
        horsPeriode: false,
      },
      {
        inscription_id: 'i2',
        mois: '2026-01',
        session_id: null,
        montant_du: 15000,
        montant_recu: 5000,
        statut: 'partiel',
        reglement: null,
        horsPeriode: false,
      },
    ])

    expect(totaux).toEqual({ du: 30000, recu: 20000, reste: 10000 })
  })

  /*
   * ⚠️ Un trop-perçu sur une ligne ne doit pas effacer le dû d'une autre : le
   * total afficherait « rien à encaisser » alors qu'un apprenant n'a rien payé.
   */
  it('ne laisse pas un trop-perçu masquer un impayé', () => {
    const totaux = totauxReglements([
      {
        inscription_id: 'i1',
        mois: '2026-01',
        session_id: null,
        montant_du: 10000,
        montant_recu: 20000,
        statut: 'paye',
        reglement: null,
        horsPeriode: false,
      },
      {
        inscription_id: 'i2',
        mois: '2026-01',
        session_id: null,
        montant_du: 10000,
        montant_recu: 0,
        statut: 'retard',
        reglement: null,
        horsPeriode: false,
      },
    ])

    expect(totaux.reste).toBe(10000)
  })
})

/* ==========================================================================
 * L'ASSEMBLAGE DE L'ÉCRAN
 *
 * Quatre bugs vivaient ici, tous invisibles tant que la logique restait dans le
 * hook — que ce projet ne teste pas. Chacun a son test.
 * ========================================================================== */

function affichable(extra: Partial<InscriptionAffichable> = {}): InscriptionAffichable {
  return {
    ...inscription(),
    apprenant: 'Aïcha Diallo',
    cours_libelle: 'Groupe Hifz',
    devise: 'XOF',
    ...extra,
  }
}

describe('assemblerFacturation', () => {
  it('rend une ligne par personne, avec de quoi l’afficher', () => {
    const { lignes } = assemblerFacturation(
      [affichable({ id: 'i1', apprenant: 'Aïcha Diallo' })],
      [],
      'mensuel',
      '2026-02',
      CONTEXTE
    )

    expect(lignes).toHaveLength(1)
    expect(lignes[0]).toMatchObject({
      apprenant: 'Aïcha Diallo',
      cours_libelle: 'Groupe Hifz',
      tarifManquant: false,
      montant_du: 15000,
    })
  })

  /*
   * ⚠️ B3 — « aucun tarif saisi » ne se déduit PAS de l'absence de période.
   * Quelqu'un arrivé en mars n'a rien à devoir en février : l'afficher comme
   * non tarifé accusait le mauvais coupable, et le bouton désactivé empêchait
   * même d'y toucher.
   */
  it('ne crie pas « sans tarif » pour qui n’est pas encore arrivé', () => {
    const { lignes } = assemblerFacturation(
      [affichable({ inscrit_le: '2026-03-10' })],
      [],
      'mensuel',
      '2026-02',
      CONTEXTE
    )

    expect(lignes).toEqual([])
  })

  it('ne crie pas « sans tarif » pour un cours déjà terminé', () => {
    const { lignes } = assemblerFacturation(
      [affichable({ cours_fin: '2026-01-31' })],
      [],
      'mensuel',
      '2026-03',
      CONTEXTE
    )

    expect(lignes).toEqual([])
  })

  it('signale le tarif VRAIMENT manquant, et ferme sa saisie', () => {
    const { lignes, totaux } = assemblerFacturation(
      [affichable({ prix_mensuel: null })],
      [],
      'mensuel',
      '2026-02',
      CONTEXTE
    )

    expect(lignes).toHaveLength(1)
    expect(lignes[0]!.tarifManquant).toBe(true)
    // Une ligne sans tarif ne compte pas dans les totaux : elle n'a pas de montant.
    expect(totaux).toEqual({ du: 0, recu: 0, reste: 0 })
  })

  it('regarde le tarif du mode ACTIF, pas celui de l’autre', () => {
    const sansForfait = [affichable({ prix_session: null })]

    expect(assemblerFacturation(sansForfait, [], 'mensuel', '2026-02', CONTEXTE).lignes[0]!
      .tarifManquant).toBe(false)
    expect(assemblerFacturation(sansForfait, [], 'par_session', '2026-02', CONTEXTE).lignes[0]!
      .tarifManquant).toBe(true)
  })

  /*
   * ⚠️ B7 — le dû d'une ligne ENREGISTRÉE est celui qu'elle porte, pas le tarif
   * courant. Sans cela, porter le tarif de 15 000 à 20 000 réécrivait le dû de
   * janvier — à l'écran d'abord, puis en base à la première correction, puisque
   * le dialogue renvoie le montant affiché.
   */
  it('fige le dû déjà enregistré, quel que soit le tarif courant', () => {
    const { lignes } = assemblerFacturation(
      [affichable({ prix_mensuel: 20000 })],
      [
        {
          inscription_id: 'i1',
          mois: '2026-02',
          session_id: null,
          montant_du: 15000,
          montant_recu: 15000,
        },
      ],
      'mensuel',
      '2026-02',
      CONTEXTE
    )

    expect(lignes[0]!.montant_du).toBe(15000)
    expect(lignes[0]!.statut).toBe('paye')
  })

  it('applique le tarif courant aux périodes pas encore réglées', () => {
    const { lignes } = assemblerFacturation(
      [affichable({ prix_mensuel: 20000 })],
      [],
      'mensuel',
      '2026-02',
      CONTEXTE
    )

    expect(lignes[0]!.montant_du).toBe(20000)
  })

  /*
   * ⚠️ B5 — ce que l'écran n'affiche pas, il doit pouvoir le dire. Un centre qui
   * a encaissé des forfaits puis est revenu au mois ne les reverrait jamais,
   * alors que les réglages promettent qu'ils « restent modifiables ».
   */
  it('compte l’argent de l’autre mode sans le mélanger aux totaux', () => {
    const { totaux, autreMode } = assemblerFacturation(
      [affichable()],
      [
        {
          inscription_id: 'i1',
          mois: null,
          session_id: 's18',
          montant_du: 120000,
          montant_recu: 120000,
        },
      ],
      'mensuel',
      '2026-02',
      CONTEXTE
    )

    expect(autreMode).toEqual({ nombre: 1, recu: 120000 })
    // Le forfait n'est PAS additionné aux mois : le total resterait dû.
    expect(totaux.recu).toBe(0)
    expect(totaux.reste).toBe(15000)
  })

  it('ne compte comme « autre mode » que les règlements de ce centre', () => {
    const { autreMode } = assemblerFacturation(
      [affichable({ id: 'i1' })],
      [
        {
          inscription_id: 'inconnue',
          mois: null,
          session_id: 's18',
          montant_du: 999,
          montant_recu: 999,
        },
      ],
      'mensuel',
      '2026-02',
      CONTEXTE
    )

    expect(autreMode.nombre).toBe(0)
  })
})

/*
 * ⚠️ B9 — `toISOString()` est en UTC alors que `moisCourant()` raisonne en heure
 * locale. Mélanger les deux fait basculer un forfait « en retard » un jour trop
 * tôt ou trop tard, et pour le seul jour où cela compte.
 */
describe('dateLocale', () => {
  it('rend le jour LOCAL, pas le jour UTC', () => {
    // 1er mars à 00h30 heure locale : `toISOString()` dirait encore février dans
    // tout fuseau à l'est de Greenwich.
    const minuitPasse = new Date(2026, 2, 1, 0, 30)

    expect(dateLocale(minuitPasse)).toBe('2026-03-01')
  })

  it('complète les zéros', () => {
    expect(dateLocale(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
