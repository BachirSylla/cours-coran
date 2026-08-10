import { describe, expect, it } from 'vitest'

import {
  BAREMES,
  estBaremeConnu,
  estNoteValide,
  formaterNote,
  LIBELLES_TENDANCE,
  MINIMUM_POUR_TENDANCE,
  moyennePourcentage,
  noteEnPourcentage,
  SEUIL_TENDANCE,
  tendance,
  type Evaluation,
} from '@/shared/lib/evaluations'

/** Évaluation datée par son rang, pour écrire des séries lisibles. */
function serie(notes: number[], bareme = 20): Evaluation[] {
  return notes.map((note, index) => ({
    date: `2026-08-${String(index + 1).padStart(2, '0')}`,
    note,
    note_bareme: bareme,
  }))
}

describe('estBaremeConnu', () => {
  it('accepte 10 et 20, refuse le reste', () => {
    expect(estBaremeConnu(10)).toBe(true)
    expect(estBaremeConnu(20)).toBe(true)
    expect(estBaremeConnu(15)).toBe(false)
    expect(estBaremeConnu(0)).toBe(false)
  })

  it('expose exactement les barèmes autorisés par la base', () => {
    expect([...BAREMES]).toEqual([10, 20])
  })
})

describe('noteEnPourcentage', () => {
  it('rend comparables des barèmes différents', () => {
    expect(noteEnPourcentage(8, 10)).toBe(80)
    expect(noteEnPourcentage(16, 20)).toBe(80)
  })

  it('gère les bornes', () => {
    expect(noteEnPourcentage(0, 20)).toBe(0)
    expect(noteEnPourcentage(20, 20)).toBe(100)
    expect(noteEnPourcentage(10, 10)).toBe(100)
  })

  it('gère les décimales', () => {
    expect(noteEnPourcentage(15.5, 20)).toBeCloseTo(77.5)
  })

  it('ne divise jamais par zéro', () => {
    expect(noteEnPourcentage(10, 0)).toBe(0)
    expect(noteEnPourcentage(10, -20)).toBe(0)
  })

  it('renvoie 0 sur une valeur non finie', () => {
    expect(noteEnPourcentage(Number.NaN, 20)).toBe(0)
    expect(noteEnPourcentage(10, Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('estNoteValide', () => {
  it('accepte les bornes', () => {
    expect(estNoteValide(0, 20)).toBe(true)
    expect(estNoteValide(20, 20)).toBe(true)
    expect(estNoteValide(10, 10)).toBe(true)
  })

  it('accepte une décimale', () => {
    expect(estNoteValide(12.5, 20)).toBe(true)
  })

  it('refuse hors bornes', () => {
    expect(estNoteValide(-0.5, 20)).toBe(false)
    expect(estNoteValide(20.5, 20)).toBe(false)
    // La même note change de validité selon le barème : 15 est hors de /10.
    expect(estNoteValide(15, 10)).toBe(false)
    expect(estNoteValide(15, 20)).toBe(true)
  })

  it('refuse les valeurs non finies ou un barème absurde', () => {
    expect(estNoteValide(Number.NaN, 20)).toBe(false)
    expect(estNoteValide(Number.POSITIVE_INFINITY, 20)).toBe(false)
    expect(estNoteValide(5, 0)).toBe(false)
  })
})

describe('moyennePourcentage', () => {
  it('renvoie null sans évaluation', () => {
    expect(moyennePourcentage([])).toBeNull()
  })

  it('moyenne des pourcentages, pas des notes brutes', () => {
    // 8/10 = 80 % et 10/20 = 50 % → 65 %. Une moyenne des notes donnerait 9,
    // un chiffre qui ne veut rien dire.
    const melange: Evaluation[] = [
      { date: '2026-08-01', note: 8, note_bareme: 10 },
      { date: '2026-08-02', note: 10, note_bareme: 20 },
    ]

    expect(moyennePourcentage(melange)).toBe(65)
  })
})

describe('tendance — données insuffisantes', () => {
  it('refuse de conclure en dessous du minimum', () => {
    expect(tendance([])).toBe('insuffisant')
    expect(tendance(serie([10]))).toBe('insuffisant')
    expect(tendance(serie([10, 12]))).toBe('insuffisant')
    expect(tendance(serie([10, 12, 14]))).toBe('insuffisant')
  })

  it('commence à conclure au minimum exact', () => {
    expect(serie([10, 10, 10, 10])).toHaveLength(MINIMUM_POUR_TENDANCE)
    expect(tendance(serie([10, 10, 10, 10]))).toBe('stable')
  })
})

describe('tendance — sens de l’évolution', () => {
  it('détecte une progression', () => {
    expect(tendance(serie([8, 9, 14, 15]))).toBe('progression')
  })

  it('détecte une baisse', () => {
    expect(tendance(serie([16, 15, 9, 8]))).toBe('baisse')
  })

  it('reste stable sur une série plate', () => {
    expect(tendance(serie([12, 12, 12, 12]))).toBe('stable')
  })

  it('ignore les fluctuations sous le seuil', () => {
    // Moyennes 12 puis 12,5 sur 20 → écart de 2,5 points de pourcentage.
    expect(tendance(serie([12, 12, 12.5, 12.5]))).toBe('stable')
  })

  it('bascule exactement au seuil, qui est inclusif', () => {
    // 10 puis 11 sur 20 = 50 % puis 55 % → écart de 5 points.
    expect(tendance(serie([10, 10, 11, 11]))).toBe('progression')
    expect(tendance(serie([11, 11, 10, 10]))).toBe('baisse')
    expect(SEUIL_TENDANCE).toBe(5)
  })

  it('reste stable juste sous le seuil', () => {
    // 10 puis 10,8 sur 20 = 50 % puis 54 % → 4 points, sous le seuil.
    expect(tendance(serie([10, 10, 10.8, 10.8]))).toBe('stable')
  })
})

describe('tendance — robustesse', () => {
  it('compare des barèmes différents sur le même terrain', () => {
    // 8/10 = 80 %, puis 18/20 = 90 % : c'est une progression, alors que les
    // notes brutes (8 puis 18) suggéreraient un bond bien plus grand.
    const melange: Evaluation[] = [
      { date: '2026-08-01', note: 8, note_bareme: 10 },
      { date: '2026-08-02', note: 8, note_bareme: 10 },
      { date: '2026-08-03', note: 18, note_bareme: 20 },
      { date: '2026-08-04', note: 18, note_bareme: 20 },
    ]

    expect(tendance(melange)).toBe('progression')
  })

  it('ne se laisse pas tromper par un barème qui monte à note égale', () => {
    // 8/10 = 80 % puis 8/20 = 40 % : la note brute est identique, mais la
    // performance a chuté de moitié.
    const melange: Evaluation[] = [
      { date: '2026-08-01', note: 8, note_bareme: 10 },
      { date: '2026-08-02', note: 8, note_bareme: 10 },
      { date: '2026-08-03', note: 8, note_bareme: 20 },
      { date: '2026-08-04', note: 8, note_bareme: 20 },
    ]

    expect(tendance(melange)).toBe('baisse')
  })

  it('trie par date, quel que soit l’ordre d’entrée', () => {
    const desordre = [...serie([8, 9, 14, 15])].reverse()

    expect(tendance(desordre)).toBe('progression')
  })

  it('rattache l’évaluation du milieu au passé sur un nombre impair', () => {
    // 5 notes : [10, 10, 10] contre [16, 16]. Le milieu appartient au passé,
    // donc le présent n'est jugé que sur ce qui est réellement récent.
    expect(tendance(serie([10, 10, 10, 16, 16]))).toBe('progression')
  })

  it('n’est pas perturbé par des notes identiques à des dates identiques', () => {
    const memeJour: Evaluation[] = [
      { date: '2026-08-01', note: 10, note_bareme: 20 },
      { date: '2026-08-01', note: 10, note_bareme: 20 },
      { date: '2026-08-02', note: 10, note_bareme: 20 },
      { date: '2026-08-02', note: 10, note_bareme: 20 },
    ]

    expect(tendance(memeJour)).toBe('stable')
  })

  it('a un libellé français pour chaque tendance', () => {
    for (const valeur of ['progression', 'stable', 'baisse', 'insuffisant'] as const) {
      expect(LIBELLES_TENDANCE[valeur]).toBeTruthy()
    }
  })
})

describe('formaterNote', () => {
  it('utilise la virgule décimale française', () => {
    expect(formaterNote(15.5, 20)).toBe('15,5/20')
  })

  it('n’ajoute pas de décimale superflue', () => {
    expect(formaterNote(15, 20)).toBe('15/20')
    expect(formaterNote(8, 10)).toBe('8/10')
  })

  it('arrondit au centième', () => {
    expect(formaterNote(12.345, 20)).toBe('12,35/20')
  })

  it('formate un zéro', () => {
    expect(formaterNote(0, 20)).toBe('0/20')
  })
})
