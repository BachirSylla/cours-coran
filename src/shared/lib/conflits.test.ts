import { describe, expect, it } from 'vitest'

import {
  aDesConflits,
  creneauxSeChevauchent,
  detecterTousLesConflits,
  heureEnMinutes,
  trouverConflits,
  type CreneauHoraire,
  type JourSemaine,
} from '@/shared/lib/conflits'

/** Créneau de test avec identité, comme les lignes de la table `creneau`. */
interface CreneauTest extends CreneauHoraire {
  id: string
  cours_id: string
}

function creneau(
  id: string,
  jour_semaine: JourSemaine,
  heure_debut: string,
  heure_fin: string,
  cours_id = `cours-${id}`
): CreneauTest {
  return { id, cours_id, jour_semaine, heure_debut, heure_fin }
}

const LUNDI = 1 satisfies JourSemaine
const MARDI = 2 satisfies JourSemaine

describe('heureEnMinutes', () => {
  it('convertit HH:MM en minutes depuis minuit', () => {
    expect(heureEnMinutes('00:00')).toBe(0)
    expect(heureEnMinutes('09:30')).toBe(570)
    expect(heureEnMinutes('24:00')).toBe(1440)
  })

  it('accepte HH:MM:SS et ignore les secondes', () => {
    expect(heureEnMinutes('09:30:00')).toBe(570)
    expect(heureEnMinutes('09:30:59')).toBe(570)
  })

  it('tolère une heure sur un seul chiffre et les espaces autour', () => {
    expect(heureEnMinutes('9:05')).toBe(545)
    expect(heureEnMinutes('  10:15  ')).toBe(615)
  })

  it('rejette les chaînes invalides', () => {
    expect(() => heureEnMinutes('10h30')).toThrow(/Heure invalide/)
    expect(() => heureEnMinutes('10:60')).toThrow(/Heure invalide/)
    expect(() => heureEnMinutes('25:00')).toThrow(/au-delà de 24:00/)
    expect(() => heureEnMinutes('')).toThrow(/Heure invalide/)
  })
})

describe('creneauxSeChevauchent', () => {
  const cas: ReadonlyArray<{
    nom: string
    a: CreneauHoraire
    b: CreneauHoraire
    attendu: boolean
  }> = [
    {
      nom: 'même jour, chevauchement partiel (A commence avant B)',
      a: { jour_semaine: LUNDI, heure_debut: '10:00', heure_fin: '11:30' },
      b: { jour_semaine: LUNDI, heure_debut: '11:00', heure_fin: '12:00' },
      attendu: true,
    },
    {
      nom: 'même jour, chevauchement partiel (B commence avant A)',
      a: { jour_semaine: LUNDI, heure_debut: '11:00', heure_fin: '12:00' },
      b: { jour_semaine: LUNDI, heure_debut: '10:00', heure_fin: '11:30' },
      attendu: true,
    },
    {
      nom: 'même jour, B entièrement inclus dans A',
      a: { jour_semaine: LUNDI, heure_debut: '09:00', heure_fin: '12:00' },
      b: { jour_semaine: LUNDI, heure_debut: '10:00', heure_fin: '11:00' },
      attendu: true,
    },
    {
      nom: 'même jour, A entièrement inclus dans B',
      a: { jour_semaine: LUNDI, heure_debut: '10:00', heure_fin: '11:00' },
      b: { jour_semaine: LUNDI, heure_debut: '09:00', heure_fin: '12:00' },
      attendu: true,
    },
    {
      nom: 'même jour, horaires strictement identiques',
      a: { jour_semaine: LUNDI, heure_debut: '10:00', heure_fin: '11:00' },
      b: { jour_semaine: LUNDI, heure_debut: '10:00', heure_fin: '11:00' },
      attendu: true,
    },
    {
      nom: 'même jour, chevauchement d’une seule minute',
      a: { jour_semaine: LUNDI, heure_debut: '10:00', heure_fin: '11:01' },
      b: { jour_semaine: LUNDI, heure_debut: '11:00', heure_fin: '12:00' },
      attendu: true,
    },
    {
      nom: 'même jour, adjacents : fin de A = début de B (aucune marge)',
      a: { jour_semaine: LUNDI, heure_debut: '11:00', heure_fin: '12:00' },
      b: { jour_semaine: LUNDI, heure_debut: '12:00', heure_fin: '13:00' },
      attendu: false,
    },
    {
      nom: 'même jour, adjacents dans l’autre sens : fin de B = début de A',
      a: { jour_semaine: LUNDI, heure_debut: '12:00', heure_fin: '13:00' },
      b: { jour_semaine: LUNDI, heure_debut: '11:00', heure_fin: '12:00' },
      attendu: false,
    },
    {
      nom: 'même jour, disjoints',
      a: { jour_semaine: LUNDI, heure_debut: '08:00', heure_fin: '09:00' },
      b: { jour_semaine: LUNDI, heure_debut: '14:00', heure_fin: '15:00' },
      attendu: false,
    },
    {
      nom: 'jours différents, mêmes heures',
      a: { jour_semaine: LUNDI, heure_debut: '10:00', heure_fin: '11:00' },
      b: { jour_semaine: MARDI, heure_debut: '10:00', heure_fin: '11:00' },
      attendu: false,
    },
    {
      nom: 'format HH:MM:SS des deux côtés, chevauchement',
      a: { jour_semaine: LUNDI, heure_debut: '10:00:00', heure_fin: '11:30:00' },
      b: { jour_semaine: LUNDI, heure_debut: '11:00:00', heure_fin: '12:00:00' },
      attendu: true,
    },
    {
      nom: 'formats mixtes HH:MM et HH:MM:SS, adjacents',
      a: { jour_semaine: LUNDI, heure_debut: '11:00', heure_fin: '12:00' },
      b: { jour_semaine: LUNDI, heure_debut: '12:00:00', heure_fin: '13:00:00' },
      attendu: false,
    },
  ]

  it.each(cas)('$nom → $attendu', ({ a, b, attendu }) => {
    expect(creneauxSeChevauchent(a, b)).toBe(attendu)
  })

  it('est symétrique sur tous les cas', () => {
    for (const { a, b } of cas) {
      expect(creneauxSeChevauchent(b, a)).toBe(creneauxSeChevauchent(a, b))
    }
  })
})

describe('trouverConflits', () => {
  const existants = [
    creneau('c1', LUNDI, '09:00', '10:00'),
    creneau('c2', LUNDI, '10:30', '11:30'),
    creneau('c3', LUNDI, '11:00', '12:00'),
    creneau('c4', MARDI, '10:30', '11:30'),
  ]

  it('renvoie tous les créneaux en conflit, en préservant leurs propriétés', () => {
    const cible = creneau('nouveau', LUNDI, '10:45', '11:15')

    const conflits = trouverConflits(cible, existants)

    expect(conflits.map((c) => c.id)).toEqual(['c2', 'c3'])
    expect(conflits[0]?.cours_id).toBe('cours-c2')
  })

  it('renvoie une liste vide quand aucun créneau ne gêne', () => {
    const cible = creneau('nouveau', LUNDI, '12:00', '13:00')

    expect(trouverConflits(cible, existants)).toEqual([])
  })

  it('ne renvoie rien pour un jour libre', () => {
    const cible = creneau('nouveau', 3, '10:30', '11:30')

    expect(trouverConflits(cible, existants)).toEqual([])
  })

  it('exclut le créneau lui-même via ignorerId lors d’une modification', () => {
    const existant = existants[1]!

    // Revalidation à l'identique : sans exclusion il se détecte lui-même…
    expect(trouverConflits(existant, existants).map((c) => c.id)).toEqual(['c2', 'c3'])

    // …et avec exclusion, seul le vrai conflit reste.
    const conflits = trouverConflits(existant, existants, { ignorerId: existant.id })
    expect(conflits.map((c) => c.id)).toEqual(['c3'])
  })

  it('accepte une clé identifiante personnalisée', () => {
    const conflits = trouverConflits(creneau('x', LUNDI, '10:45', '11:15'), existants, {
      ignorerId: 'cours-c2',
      cleId: 'cours_id',
    })

    expect(conflits.map((c) => c.id)).toEqual(['c3'])
  })

  it('accepte un prédicat d’exclusion', () => {
    const conflits = trouverConflits(creneau('x', LUNDI, '10:45', '11:15'), existants, {
      ignorer: (c) => c.id === 'c3',
    })

    expect(conflits.map((c) => c.id)).toEqual(['c2'])
  })

  it('ne considère pas les créneaux adjacents comme des conflits', () => {
    const cible = creneau('nouveau', LUNDI, '08:00', '09:00')

    expect(trouverConflits(cible, existants)).toEqual([])
  })
})

describe('aDesConflits', () => {
  const existants = [
    creneau('c1', LUNDI, '09:00', '10:00'),
    creneau('c2', MARDI, '14:00', '15:00'),
  ]

  it('détecte un conflit', () => {
    expect(aDesConflits(creneau('x', LUNDI, '09:30', '10:30'), existants)).toBe(true)
  })

  it('renvoie false sur un créneau libre', () => {
    expect(aDesConflits(creneau('x', LUNDI, '10:00', '11:00'), existants)).toBe(false)
  })

  it('renvoie false sur une liste vide', () => {
    expect(aDesConflits(creneau('x', LUNDI, '09:30', '10:30'), [])).toBe(false)
  })

  it('respecte l’exclusion du créneau modifié', () => {
    const existant = existants[0]!

    expect(aDesConflits(existant, existants)).toBe(true)
    expect(aDesConflits(existant, existants, { ignorerId: existant.id })).toBe(false)
  })
})

describe('detecterTousLesConflits', () => {
  it('renvoie [] sur un ensemble sans conflit', () => {
    const creneaux = [
      creneau('c1', LUNDI, '09:00', '10:00'),
      creneau('c2', LUNDI, '10:00', '11:00'),
      creneau('c3', MARDI, '09:00', '10:00'),
    ]

    expect(detecterTousLesConflits(creneaux)).toEqual([])
  })

  it('renvoie [] sur un ensemble vide ou à un seul créneau', () => {
    expect(detecterTousLesConflits([])).toEqual([])
    expect(detecterTousLesConflits([creneau('c1', LUNDI, '09:00', '10:00')])).toEqual([])
  })

  it('renvoie toutes les paires en conflit, sans doublon symétrique', () => {
    const creneaux = [
      creneau('c1', LUNDI, '09:00', '11:00'),
      creneau('c2', LUNDI, '10:00', '12:00'),
      creneau('c3', LUNDI, '10:30', '11:30'),
      creneau('c4', MARDI, '09:00', '11:00'),
      creneau('c5', MARDI, '11:00', '12:00'),
    ]

    const paires = detecterTousLesConflits(creneaux)

    expect(paires.map(([a, b]) => `${a.id}-${b.id}`)).toEqual(['c1-c2', 'c1-c3', 'c2-c3'])
  })

  it('ne renvoie jamais une paire et son symétrique', () => {
    const creneaux = [
      creneau('c1', LUNDI, '09:00', '11:00'),
      creneau('c2', LUNDI, '10:00', '12:00'),
    ]

    const paires = detecterTousLesConflits(creneaux)
    const cles = paires.map(([a, b]) => [a.id, b.id].sort().join('|'))

    expect(paires).toHaveLength(1)
    expect(new Set(cles).size).toBe(cles.length)
  })

  it('signale un doublon présent deux fois dans la liste', () => {
    const doublon = creneau('c1', LUNDI, '09:00', '11:00')

    expect(detecterTousLesConflits([doublon, doublon])).toEqual([[doublon, doublon]])
  })
})
