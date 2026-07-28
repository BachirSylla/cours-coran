import { describe, expect, it } from 'vitest'

import {
  detecterConflitsFormulaire,
  indexEnConflit,
  messageConflit,
  type CreneauExistant,
} from '@/features/cours/conflitsCours'
import type { JourSemaine } from '@/shared/lib/conflits'

function existant(
  id: string,
  cours_id: string,
  cours_libelle: string,
  jour_semaine: JourSemaine,
  heure_debut: string,
  heure_fin: string
): CreneauExistant {
  return { id, cours_id, cours_libelle, jour_semaine, heure_debut, heure_fin }
}

// Créneaux déjà enregistrés : « Groupe Hifz » lundi 10:00–11:00 et mercredi 15:00–16:00,
// « Lecture Aïcha » mardi 09:00–10:00.
const EXISTANTS = [
  existant('c1', 'cours-hifz', 'Groupe Hifz', 1, '10:00:00', '11:00:00'),
  existant('c2', 'cours-hifz', 'Groupe Hifz', 3, '15:00:00', '16:00:00'),
  existant('c3', 'cours-lecture', 'Lecture Aïcha', 2, '09:00:00', '10:00:00'),
]

describe('detecterConflitsFormulaire', () => {
  it('ne signale rien quand le créneau est libre', () => {
    const conflits = detecterConflitsFormulaire(
      [{ jour_semaine: '5', heure_debut: '14:00', heure_fin: '15:00' }],
      EXISTANTS
    )

    expect(conflits).toEqual([])
  })

  it('signale un chevauchement avec un autre cours, en le nommant', () => {
    const conflits = detecterConflitsFormulaire(
      [{ jour_semaine: '1', heure_debut: '10:30', heure_fin: '11:30' }],
      EXISTANTS
    )

    expect(conflits).toHaveLength(1)
    expect(conflits[0]).toMatchObject({
      type: 'externe',
      index: 0,
      coursLibelle: 'Groupe Hifz',
    })
    expect(messageConflit(conflits[0]!)).toBe(
      'Lundi 10:30–11:30 chevauche le cours « Groupe Hifz ».'
    )
  })

  it('ne signale rien pour un créneau adjacent (aucune marge)', () => {
    const conflits = detecterConflitsFormulaire(
      [
        { jour_semaine: '1', heure_debut: '11:00', heure_fin: '12:00' },
        { jour_semaine: '1', heure_debut: '09:00', heure_fin: '10:00' },
      ],
      EXISTANTS
    )

    expect(conflits).toEqual([])
  })

  it('signale un chevauchement interne entre deux créneaux du même formulaire', () => {
    const conflits = detecterConflitsFormulaire(
      [
        { jour_semaine: '5', heure_debut: '14:00', heure_fin: '15:30' },
        { jour_semaine: '5', heure_debut: '15:00', heure_fin: '16:00' },
      ],
      EXISTANTS
    )

    expect(conflits).toHaveLength(1)
    expect(conflits[0]).toMatchObject({ type: 'interne', index: 1, autreIndex: 0 })
    expect(messageConflit(conflits[0]!)).toBe(
      'Vendredi 15:00–16:00 chevauche un autre créneau de ce cours.'
    )
  })

  it('en édition, un cours ne se détecte pas lui-même', () => {
    const creneauxInchanges = [
      { jour_semaine: '1', heure_debut: '10:00', heure_fin: '11:00' },
      { jour_semaine: '3', heure_debut: '15:00', heure_fin: '16:00' },
    ]

    // Sans exclusion, le cours entre en conflit avec ses propres créneaux…
    expect(detecterConflitsFormulaire(creneauxInchanges, EXISTANTS)).toHaveLength(2)

    // …et avec l'exclusion, il est libre de se réenregistrer.
    expect(detecterConflitsFormulaire(creneauxInchanges, EXISTANTS, 'cours-hifz')).toEqual([])
  })

  it('en édition, le conflit avec un AUTRE cours reste détecté', () => {
    const conflits = detecterConflitsFormulaire(
      [{ jour_semaine: '2', heure_debut: '09:30', heure_fin: '10:30' }],
      EXISTANTS,
      'cours-hifz'
    )

    expect(conflits).toHaveLength(1)
    expect(conflits[0]).toMatchObject({ type: 'externe', coursLibelle: 'Lecture Aïcha' })
  })

  it('ignore les lignes incomplètes ou incohérentes en cours de saisie', () => {
    const conflits = detecterConflitsFormulaire(
      [
        { jour_semaine: '1', heure_debut: '', heure_fin: '' },
        { jour_semaine: '1', heure_debut: '10:3', heure_fin: '11:00' },
        { jour_semaine: '1', heure_debut: '11:00', heure_fin: '10:00' },
        { jour_semaine: '', heure_debut: '10:00', heure_fin: '11:00' },
      ],
      EXISTANTS
    )

    expect(conflits).toEqual([])
  })

  it('conserve l’index réel de la ligne malgré les lignes ignorées', () => {
    const conflits = detecterConflitsFormulaire(
      [
        { jour_semaine: '1', heure_debut: '', heure_fin: '' },
        { jour_semaine: '1', heure_debut: '10:30', heure_fin: '11:30' },
      ],
      EXISTANTS
    )

    expect(conflits[0]?.index).toBe(1)
  })

  it('signale plusieurs conflits quand plusieurs créneaux heurtent l’existant', () => {
    const conflits = detecterConflitsFormulaire(
      [
        { jour_semaine: '1', heure_debut: '10:30', heure_fin: '11:30' },
        { jour_semaine: '3', heure_debut: '15:30', heure_fin: '16:30' },
      ],
      EXISTANTS
    )

    expect(conflits).toHaveLength(2)
    expect(conflits.map((c) => c.index)).toEqual([0, 1])
  })

  it('fonctionne sur une base vide (premier cours créé)', () => {
    expect(
      detecterConflitsFormulaire(
        [{ jour_semaine: '1', heure_debut: '10:00', heure_fin: '11:00' }],
        []
      )
    ).toEqual([])
  })
})

describe('indexEnConflit', () => {
  it('renvoie les lignes à surligner, les deux côtés pour un conflit interne', () => {
    const conflits = detecterConflitsFormulaire(
      [
        { jour_semaine: '5', heure_debut: '14:00', heure_fin: '15:30' },
        { jour_semaine: '5', heure_debut: '15:00', heure_fin: '16:00' },
      ],
      []
    )

    expect([...indexEnConflit(conflits)].sort()).toEqual([0, 1])
  })

  it('renvoie un ensemble vide sans conflit', () => {
    expect(indexEnConflit([]).size).toBe(0)
  })
})
