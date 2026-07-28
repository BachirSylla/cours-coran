import { describe, expect, it } from 'vitest'

import {
  clePaiement,
  compterParStatut,
  estMoisValide,
  formaterMontant,
  libelleMois,
  moisPrecedent,
  fusionnerPaiements,
  genererMoisDus,
  LIBELLES_STATUT_PAIEMENT,
  moisCourant,
  moisDe,
  moisSuivant,
  statutPaiement,
  totaliser,
  type CoursFacturable,
  type PaiementRapprochable,
} from '@/shared/lib/paiements'

function cours(options: Partial<CoursFacturable> = {}): CoursFacturable {
  return {
    id: 'cours-1',
    prix_mensuel: 15000,
    date_debut: '2026-07-15',
    date_fin: null,
    ...options,
  }
}

function paiement(
  mois: string,
  montantRecu: number,
  montantDu = 15000,
  coursId = 'cours-1'
): PaiementRapprochable & { id: string } {
  return {
    id: `${coursId}-${mois}`,
    cours_id: coursId,
    mois_concerne: mois,
    montant_du: montantDu,
    montant_recu: montantRecu,
  }
}

describe('helpers de mois', () => {
  it('extrait le mois d’une date', () => {
    expect(moisDe('2026-07-28')).toBe('2026-07')
    expect(moisDe('2026-01-01')).toBe('2026-01')
  })

  it('passe au mois suivant, y compris d’une année à l’autre', () => {
    expect(moisSuivant('2026-07')).toBe('2026-08')
    expect(moisSuivant('2026-09')).toBe('2026-10')
    expect(moisSuivant('2026-12')).toBe('2027-01')
  })

  it('valide le format AAAA-MM', () => {
    expect(estMoisValide('2026-07')).toBe(true)
    expect(estMoisValide('2026-13')).toBe(false)
    expect(estMoisValide('2026-00')).toBe(false)
    expect(estMoisValide('juillet')).toBe(false)
  })

  it('donne le mois courant en heure locale', () => {
    expect(moisCourant(new Date(2026, 0, 1))).toBe('2026-01')
    expect(moisCourant(new Date(2026, 11, 31))).toBe('2026-12')
  })

  it('l’ordre des chaînes est l’ordre chronologique', () => {
    expect('2026-09' < '2026-10').toBe(true)
    expect('2026-12' < '2027-01').toBe(true)
  })
})

describe('genererMoisDus', () => {
  it('génère un seul mois quand la période tient dans un mois', () => {
    expect(genererMoisDus(cours({ date_debut: '2026-07-15' }), '2026-07')).toEqual([
      { cours_id: 'cours-1', mois: '2026-07', montant_du: 15000 },
    ])
  })

  it('génère un dû par mois jusqu’à moisMax inclus', () => {
    const dus = genererMoisDus(cours({ date_debut: '2026-07-15' }), '2026-10')

    expect(dus.map((d) => d.mois)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10'])
  })

  it('traverse le changement d’année', () => {
    const dus = genererMoisDus(cours({ date_debut: '2026-11-20' }), '2027-02')

    expect(dus.map((d) => d.mois)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
  })

  it('s’arrête au mois de date_fin quand il précède moisMax', () => {
    const dus = genererMoisDus(
      cours({ date_debut: '2026-07-01', date_fin: '2026-09-10' }),
      '2026-12'
    )

    expect(dus.map((d) => d.mois)).toEqual(['2026-07', '2026-08', '2026-09'])
  })

  it('inclut le mois de date_fin même si le cours s’arrête en début de mois', () => {
    const dus = genererMoisDus(
      cours({ date_debut: '2026-07-01', date_fin: '2026-08-02' }),
      '2026-12'
    )

    expect(dus.map((d) => d.mois)).toEqual(['2026-07', '2026-08'])
  })

  it('est borné par moisMax quand date_fin est plus lointaine', () => {
    const dus = genererMoisDus(
      cours({ date_debut: '2026-07-01', date_fin: '2027-06-30' }),
      '2026-09'
    )

    expect(dus.map((d) => d.mois)).toEqual(['2026-07', '2026-08', '2026-09'])
  })

  it('ne génère rien pour un cours sans prix mensuel', () => {
    expect(genererMoisDus(cours({ prix_mensuel: null }), '2026-12')).toEqual([])
  })

  it('ne génère rien quand le cours démarre après moisMax', () => {
    expect(genererMoisDus(cours({ date_debut: '2026-10-01' }), '2026-08')).toEqual([])
  })

  it('ne génère rien quand le cours s’est terminé avant sa date de début', () => {
    expect(
      genererMoisDus(cours({ date_debut: '2026-08-01', date_fin: '2026-07-31' }), '2026-12')
    ).toEqual([])
  })

  it('reprend le prix mensuel comme montant dû', () => {
    const dus = genererMoisDus(cours({ prix_mensuel: 25000 }), '2026-08')

    expect(dus.every((d) => d.montant_du === 25000)).toBe(true)
  })

  it('accepte un prix à zéro (cours gratuit) sans le confondre avec l’absence de prix', () => {
    const dus = genererMoisDus(cours({ prix_mensuel: 0 }), '2026-07')

    expect(dus).toHaveLength(1)
    expect(dus[0]?.montant_du).toBe(0)
  })
})

describe('statutPaiement', () => {
  const COURANT = '2026-08'

  it('est payé quand le reçu couvre le dû', () => {
    expect(statutPaiement(15000, 15000, '2026-07', COURANT)).toBe('paye')
  })

  it('est payé quand le reçu dépasse le dû', () => {
    expect(statutPaiement(15000, 20000, '2026-07', COURANT)).toBe('paye')
  })

  it('est partiel quand une partie seulement a été reçue', () => {
    expect(statutPaiement(15000, 5000, '2026-07', COURANT)).toBe('partiel')
    // Même pour un mois passé : « partiel » est plus précis que « retard ».
    expect(statutPaiement(15000, 14999, '2026-01', COURANT)).toBe('partiel')
  })

  it('est en retard sur un mois passé sans aucun règlement', () => {
    expect(statutPaiement(15000, 0, '2026-07', COURANT)).toBe('retard')
  })

  it('est en attente sur le mois courant, jamais en retard', () => {
    expect(statutPaiement(15000, 0, COURANT, COURANT)).toBe('attente')
  })

  it('est en attente sur un mois futur', () => {
    expect(statutPaiement(15000, 0, '2026-12', COURANT)).toBe('attente')
  })

  it('considère un dû nul comme payé', () => {
    expect(statutPaiement(0, 0, '2026-01', COURANT)).toBe('paye')
  })

  it('a un libellé français pour chaque statut', () => {
    for (const statut of ['paye', 'partiel', 'attente', 'retard'] as const) {
      expect(LIBELLES_STATUT_PAIEMENT[statut]).toBeTruthy()
    }
  })
})

describe('clePaiement', () => {
  it('distingue deux cours sur le même mois', () => {
    expect(clePaiement({ cours_id: 'a', mois: '2026-07' })).not.toBe(
      clePaiement({ cours_id: 'b', mois: '2026-07' })
    )
  })
})

describe('fusionnerPaiements', () => {
  const dus = genererMoisDus(cours({ date_debut: '2026-07-01' }), '2026-09')

  it('marque les mois sans règlement', () => {
    const lignes = fusionnerPaiements(dus, [], '2026-09')

    expect(lignes).toHaveLength(3)
    expect(lignes.every((ligne) => ligne.paiement === null && ligne.montant_recu === 0)).toBe(
      true
    )
    expect(lignes.map((ligne) => ligne.statut)).toEqual(['retard', 'retard', 'attente'])
  })

  it('rattache un règlement à son mois et calcule le statut', () => {
    const existant = paiement('2026-07', 15000)
    const lignes = fusionnerPaiements(dus, [existant], '2026-09')

    expect(lignes[0]).toMatchObject({ mois: '2026-07', statut: 'paye', montant_recu: 15000 })
    expect(lignes[0]?.paiement).toBe(existant)
    expect(lignes[1]?.statut).toBe('retard')
  })

  it('reconnaît un règlement partiel', () => {
    const lignes = fusionnerPaiements(dus, [paiement('2026-08', 5000)], '2026-09')

    expect(lignes[1]).toMatchObject({ mois: '2026-08', statut: 'partiel', montant_recu: 5000 })
  })

  it('conserve un règlement hors période et le signale', () => {
    // Le cours a été raccourci depuis, mais l'argent a bien été encaissé.
    const lignes = fusionnerPaiements(dus, [paiement('2026-05', 15000)], '2026-09')

    expect(lignes).toHaveLength(4)
    const hors = lignes.find((ligne) => ligne.horsPeriode)
    expect(hors).toMatchObject({ mois: '2026-05', statut: 'paye' })
  })

  it('trie par mois, hors période comprise', () => {
    const lignes = fusionnerPaiements(dus, [paiement('2026-05', 15000)], '2026-09')

    expect(lignes.map((ligne) => ligne.mois)).toEqual([
      '2026-05',
      '2026-07',
      '2026-08',
      '2026-09',
    ])
  })

  it('ne mélange pas deux cours sur le même mois', () => {
    const dusDeuxCours = [
      ...genererMoisDus(cours({ id: 'cours-1', date_debut: '2026-07-01' }), '2026-07'),
      ...genererMoisDus(cours({ id: 'cours-2', date_debut: '2026-07-01' }), '2026-07'),
    ]

    const lignes = fusionnerPaiements(
      dusDeuxCours,
      [paiement('2026-07', 15000, 15000, 'cours-2')],
      '2026-07'
    )

    expect(lignes.find((l) => l.cours_id === 'cours-2')?.statut).toBe('paye')
    expect(lignes.find((l) => l.cours_id === 'cours-1')?.statut).toBe('attente')
  })

  it('accepte les deux ensembles vides', () => {
    expect(fusionnerPaiements([], [], '2026-09')).toEqual([])
  })
})

describe('totaliser', () => {
  it('additionne dû et reçu, et calcule le reste', () => {
    const lignes = fusionnerPaiements(
      genererMoisDus(cours({ date_debut: '2026-07-01' }), '2026-08'),
      [paiement('2026-07', 5000)],
      '2026-08'
    )

    expect(totaliser(lignes)).toEqual({ du: 30000, recu: 5000, reste: 25000 })
  })

  it('ne renvoie jamais un reste négatif', () => {
    const lignes = fusionnerPaiements(
      genererMoisDus(cours({ date_debut: '2026-07-01' }), '2026-07'),
      [paiement('2026-07', 20000)],
      '2026-07'
    )

    expect(totaliser(lignes).reste).toBe(0)
  })

  it('renvoie des totaux nuls sans ligne', () => {
    expect(totaliser([])).toEqual({ du: 0, recu: 0, reste: 0 })
  })
})

describe('moisPrecedent', () => {
  it('recule d’un mois, y compris d’une année à l’autre', () => {
    expect(moisPrecedent('2026-08')).toBe('2026-07')
    expect(moisPrecedent('2026-10')).toBe('2026-09')
    expect(moisPrecedent('2027-01')).toBe('2026-12')
  })

  it('est l’inverse de moisSuivant', () => {
    for (const mois of ['2026-01', '2026-07', '2026-12']) {
      expect(moisPrecedent(moisSuivant(mois))).toBe(mois)
    }
  })
})

describe('compterParStatut', () => {
  it('compte chaque statut d’un ensemble mixte', () => {
    const lignes = fusionnerPaiements(
      genererMoisDus(cours({ date_debut: '2026-06-01' }), '2026-09'),
      [paiement('2026-06', 15000), paiement('2026-07', 5000)],
      '2026-09'
    )

    expect(compterParStatut(lignes)).toEqual({
      paye: 1, // juin réglé
      partiel: 1, // juillet partiellement réglé
      retard: 1, // août impayé et passé
      attente: 1, // septembre, mois courant
    })
  })

  it('renvoie des compteurs à zéro sans ligne', () => {
    expect(compterParStatut([])).toEqual({ paye: 0, partiel: 0, attente: 0, retard: 0 })
  })
})

describe('formaterMontant', () => {
  it('formate en convention française avec la devise', () => {
    // L'espace utilisée par Intl est insécable : on compare sur le contenu.
    expect(formaterMontant(15000, 'XOF')).toMatch(/15\s?000/)
    expect(formaterMontant(15000, 'XOF')).toMatch(/XOF|F\s?CFA/)
  })

  it('utilise XOF par défaut', () => {
    expect(formaterMontant(1000)).toMatch(/XOF|F\s?CFA/)
  })
})

describe('libelleMois', () => {
  it('donne un libellé français lisible', () => {
    expect(libelleMois('2026-07')).toBe('juillet 2026')
    expect(libelleMois('2026-01')).toBe('janvier 2026')
    expect(libelleMois('2026-12')).toBe('décembre 2026')
  })
})
