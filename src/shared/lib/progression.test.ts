import { describe, expect, it } from 'vitest'

import {
  calculerProgression,
  exercicesAVerifier,
  formaterPosition,
  miseEnAvantPour,
  type SeanceProgression,
} from '@/shared/lib/progression'

function seance(date: string, options: Partial<SeanceProgression> = {}): SeanceProgression {
  return {
    date,
    statut: 'faite',
    contenu_aborde: null,
    sourate: null,
    versets_de: null,
    versets_a: null,
    type_travail: null,
    exercices_a_faire: null,
    ...options,
  }
}

describe('calculerProgression — cas de base', () => {
  it('renvoie une progression vide sans séance', () => {
    const progression = calculerProgression([], 'Mémorisation')

    expect(progression.nbSeancesFaites).toBe(0)
    expect(progression.derniereSeance).toBeNull()
    expect(progression.dernierePositionTravaillee).toBeNull()
    expect(progression.derniereNouvelleMemorisation).toBeNull()
    expect(progression.dernierExerciceDonne).toBeNull()
  })

  it('ignore les séances non faites', () => {
    const progression = calculerProgression(
      [
        seance('2026-07-27', { contenu_aborde: 'Faite' }),
        seance('2026-07-28', { statut: 'annulee', contenu_aborde: 'Annulée' }),
        seance('2026-07-29', { statut: 'reportee', contenu_aborde: 'Reportée' }),
        seance('2026-07-30', { statut: 'absence', contenu_aborde: 'Absence' }),
      ],
      'Initiation à la lecture du Coran'
    )

    expect(progression.nbSeancesFaites).toBe(1)
    expect(progression.derniereSeance?.contenu_aborde).toBe('Faite')
  })

  it('prend le contenu de la séance la plus récente', () => {
    const progression = calculerProgression(
      [
        seance('2026-07-27', { contenu_aborde: 'Nourania page 10' }),
        seance('2026-08-03', { contenu_aborde: 'Nourania page 12' }),
      ],
      'Initiation Nourania'
    )

    expect(progression.derniereSeance).toEqual({
      date: '2026-08-03',
      contenu_aborde: 'Nourania page 12',
    })
  })

  it('trie quel que soit l’ordre d’entrée', () => {
    const progression = calculerProgression(
      [
        seance('2026-08-10', { contenu_aborde: 'Dernière' }),
        seance('2026-07-27', { contenu_aborde: 'Première' }),
        seance('2026-08-03', { contenu_aborde: 'Milieu' }),
      ],
      null
    )

    expect(progression.derniereSeance?.contenu_aborde).toBe('Dernière')
  })

  it('départage deux séances du même jour par l’heure', () => {
    const progression = calculerProgression(
      [
        seance('2026-07-27', { heure_debut: '15:00', contenu_aborde: 'Après-midi' }),
        seance('2026-07-27', { heure_debut: '09:00', contenu_aborde: 'Matin' }),
      ],
      null
    )

    expect(progression.derniereSeance?.contenu_aborde).toBe('Après-midi')
  })
})

describe('calculerProgression — position atteinte', () => {
  it('ignore les séances sans sourate ni verset', () => {
    const progression = calculerProgression(
      [
        seance('2026-07-27', { sourate: 'Al-Fatiha', versets_de: 1, versets_a: 7 }),
        seance('2026-08-03', { contenu_aborde: 'Séance de tajweed, rien de noté' }),
      ],
      'Mémorisation'
    )

    expect(progression.dernierePositionTravaillee).toEqual({
      date: '2026-07-27',
      sourate: 'Al-Fatiha',
      versets_de: 1,
      versets_a: 7,
    })
  })

  it('retient une position même sans sourate (versets seuls)', () => {
    const progression = calculerProgression(
      [seance('2026-07-27', { versets_de: 10, versets_a: 20 })],
      'Lecture du Coran'
    )

    expect(progression.dernierePositionTravaillee?.versets_de).toBe(10)
  })

  it('ne retient pas une sourate vide', () => {
    const progression = calculerProgression(
      [seance('2026-07-27', { sourate: '   ' })],
      'Mémorisation'
    )

    expect(progression.dernierePositionTravaillee).toBeNull()
  })

  it('une révision postérieure ne fait pas reculer la nouvelle mémorisation', () => {
    const progression = calculerProgression(
      [
        seance('2026-07-27', {
          sourate: 'Al-Baqara',
          versets_de: 1,
          versets_a: 20,
          type_travail: 'nouvelle_memorisation',
        }),
        seance('2026-08-03', {
          sourate: 'Al-Fatiha',
          versets_de: 1,
          versets_a: 7,
          type_travail: 'revision',
        }),
      ],
      'Mémorisation'
    )

    // Ce qui a été travaillé en dernier…
    expect(progression.dernierePositionTravaillee?.sourate).toBe('Al-Fatiha')
    // …mais le front de mémorisation reste Al-Baqara.
    expect(progression.derniereNouvelleMemorisation?.sourate).toBe('Al-Baqara')
    expect(progression.derniereNouvelleMemorisation?.versets_a).toBe(20)
  })

  it('avance le repère quand une nouvelle mémorisation plus récente arrive', () => {
    const progression = calculerProgression(
      [
        seance('2026-07-27', {
          sourate: 'Al-Baqara',
          versets_a: 20,
          type_travail: 'nouvelle_memorisation',
        }),
        seance('2026-08-03', {
          sourate: 'Al-Baqara',
          versets_de: 21,
          versets_a: 40,
          type_travail: 'nouvelle_memorisation',
        }),
      ],
      'Mémorisation'
    )

    expect(progression.derniereNouvelleMemorisation?.versets_de).toBe(21)
  })

  it('laisse le repère de mémorisation vide si aucune nouvelle mémorisation', () => {
    const progression = calculerProgression(
      [seance('2026-07-27', { sourate: 'Al-Fatiha', type_travail: 'revision' })],
      'Mémorisation'
    )

    expect(progression.dernierePositionTravaillee).not.toBeNull()
    expect(progression.derniereNouvelleMemorisation).toBeNull()
  })
})

describe('calculerProgression — comptages', () => {
  it('compte nouveau, révision et lecture séparément', () => {
    const progression = calculerProgression(
      [
        seance('2026-07-01', { type_travail: 'nouvelle_memorisation' }),
        seance('2026-07-02', { type_travail: 'nouvelle_memorisation' }),
        seance('2026-07-03', { type_travail: 'revision' }),
        seance('2026-07-04', { type_travail: 'lecture' }),
        seance('2026-07-05', { type_travail: null }),
        seance('2026-07-06', { statut: 'annulee', type_travail: 'revision' }),
      ],
      'Mémorisation'
    )

    expect(progression.nbSeancesFaites).toBe(5)
    expect(progression.nbNouvelles).toBe(2)
    expect(progression.nbRevisions).toBe(1)
    expect(progression.nbLectures).toBe(1)
  })
})

describe('calculerProgression — exercices', () => {
  it('retient le dernier exercice donné', () => {
    const progression = calculerProgression(
      [
        seance('2026-07-27', { exercices_a_faire: 'Relire 5 fois' }),
        seance('2026-08-03', { exercices_a_faire: 'Mémoriser 3 versets' }),
      ],
      null
    )

    expect(progression.dernierExerciceDonne).toEqual({
      date: '2026-08-03',
      exercices: 'Mémoriser 3 versets',
    })
  })

  it('saute les séances sans exercice', () => {
    const progression = calculerProgression(
      [
        seance('2026-07-27', { exercices_a_faire: 'Relire 5 fois' }),
        seance('2026-08-03', { exercices_a_faire: '   ' }),
        seance('2026-08-10', { exercices_a_faire: null }),
      ],
      null
    )

    expect(progression.dernierExerciceDonne?.date).toBe('2026-07-27')
  })
})

describe('miseEnAvantPour', () => {
  it('met en avant la position pour la lecture et la mémorisation', () => {
    expect(miseEnAvantPour('Lecture du Coran')).toBe('position')
    expect(miseEnAvantPour('Mémorisation')).toBe('position')
  })

  it('met en avant le contenu pour l’initiation, malgré le mot « lecture »', () => {
    expect(miseEnAvantPour('Initiation à la lecture du Coran')).toBe('contenu')
  })

  it('retombe sur le contenu quand le type est inconnu', () => {
    expect(miseEnAvantPour(null)).toBe('contenu')
    expect(miseEnAvantPour(undefined)).toBe('contenu')
    expect(miseEnAvantPour('Tajweed')).toBe('contenu')
  })
})

describe('exercicesAVerifier', () => {
  const seances = [
    seance('2026-07-27', { exercices_a_faire: 'Relire 5 fois' }),
    seance('2026-08-03', { exercices_a_faire: 'Mémoriser 3 versets' }),
    seance('2026-08-10', { exercices_a_faire: null }),
  ]

  it('renvoie le dernier exercice donné sans borne', () => {
    expect(exercicesAVerifier(seances)?.exercices).toBe('Mémoriser 3 versets')
  })

  it('ne regarde que les séances strictement antérieures à la date donnée', () => {
    expect(exercicesAVerifier(seances, '2026-08-03')?.exercices).toBe('Relire 5 fois')
  })

  it('renvoie null quand aucune séance ne précède la date', () => {
    expect(exercicesAVerifier(seances, '2026-07-27')).toBeNull()
  })

  it('renvoie null sans aucun exercice donné', () => {
    expect(exercicesAVerifier([seance('2026-07-27')])).toBeNull()
  })

  it('ignore les séances non faites', () => {
    const annulee = [
      seance('2026-07-27', { statut: 'annulee', exercices_a_faire: 'Ne compte pas' }),
    ]

    expect(exercicesAVerifier(annulee)).toBeNull()
  })
})

describe('formaterPosition', () => {
  it('formate une plage de versets', () => {
    expect(
      formaterPosition({
        date: '2026-07-27',
        sourate: 'Al-Fatiha',
        versets_de: 1,
        versets_a: 7,
      })
    ).toBe('Al-Fatiha, versets 1 à 7')
  })

  it('formate un verset unique', () => {
    expect(
      formaterPosition({
        date: '2026-07-27',
        sourate: 'Al-Fatiha',
        versets_de: 5,
        versets_a: 5,
      })
    ).toBe('Al-Fatiha, verset 5')
  })

  it('formate une borne manquante', () => {
    expect(
      formaterPosition({
        date: '2026-07-27',
        sourate: 'Al-Baqara',
        versets_de: 21,
        versets_a: null,
      })
    ).toBe('Al-Baqara, à partir du verset 21')
    expect(
      formaterPosition({ date: '2026-07-27', sourate: null, versets_de: null, versets_a: 40 })
    ).toBe("jusqu'au verset 40")
  })

  it('formate une sourate seule', () => {
    expect(
      formaterPosition({
        date: '2026-07-27',
        sourate: 'Ya-Sin',
        versets_de: null,
        versets_a: null,
      })
    ).toBe('Ya-Sin')
  })
})
