import { describe, expect, it } from 'vitest'

import {
  detecterConflitsFormulaire,
  indexEnConflit,
  messageConflit,
  type CreneauExistant,
} from '@/features/cours/conflitsCours'
import type { JourSemaine } from '@/shared/lib/conflits'

/**
 * Sauf mention contraire, tout ce fichier décrit un centre à UN enseignant :
 * c'est la situation d'aujourd'hui, et ces cas servent de non-régression au
 * scoping par agenda. Les cas à deux enseignants ont leur propre bloc.
 */
const ENSEIGNANT = 'ens-a'
const AUTRE_ENSEIGNANT = 'ens-b'

function existant(
  id: string,
  cours_id: string,
  cours_libelle: string,
  jour_semaine: JourSemaine,
  heure_debut: string,
  heure_fin: string,
  enseignant_id: string | null = ENSEIGNANT,
  session_id = 'session-1'
): CreneauExistant {
  return {
    id,
    cours_id,
    cours_libelle,
    enseignant_id,
    session_id,
    jour_semaine,
    heure_debut,
    heure_fin,
  }
}

// Créneaux déjà enregistrés : « Groupe Hifz » lundi 10:00–11:00 et mercredi 15:00–16:00,
// « Lecture Aïcha » mardi 09:00–10:00.
const EXISTANTS = [
  existant('c1', 'cours-hifz', 'Groupe Hifz', 1, '10:00:00', '11:00:00'),
  existant('c2', 'cours-hifz', 'Groupe Hifz', 3, '15:00:00', '16:00:00'),
  existant('c3', 'cours-lecture', 'Lecture Aïcha', 2, '09:00:00', '10:00:00'),
]

/** Raccourci : le cours saisi est assuré par `ENSEIGNANT`, sauf indication. */
function detecter(
  saisis: Parameters<typeof detecterConflitsFormulaire>[0],
  existants: Parameters<typeof detecterConflitsFormulaire>[1] = EXISTANTS,
  coursIdEdite?: string,
  enseignantId: string | null = ENSEIGNANT,
  sessionId = 'session-1'
) {
  return detecterConflitsFormulaire(saisis, existants, {
    sessionId,
    coursIdEdite,
    enseignantId,
  })
}

describe('detecterConflitsFormulaire', () => {
  it('ne signale rien quand le créneau est libre', () => {
    const conflits = detecter(
      [{ jour_semaine: '5', heure_debut: '14:00', heure_fin: '15:00' }],
      EXISTANTS
    )

    expect(conflits).toEqual([])
  })

  it('signale un chevauchement avec un autre cours, en le nommant', () => {
    const conflits = detecter(
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
      'Lundi 10:30–11:30 chevauche le cours « Groupe Hifz » du même enseignant.'
    )
  })

  it('ne signale rien pour un créneau adjacent (aucune marge)', () => {
    const conflits = detecter(
      [
        { jour_semaine: '1', heure_debut: '11:00', heure_fin: '12:00' },
        { jour_semaine: '1', heure_debut: '09:00', heure_fin: '10:00' },
      ],
      EXISTANTS
    )

    expect(conflits).toEqual([])
  })

  it('signale un chevauchement interne entre deux créneaux du même formulaire', () => {
    const conflits = detecter(
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
    expect(detecter(creneauxInchanges)).toHaveLength(2)

    // …et avec l'exclusion, il est libre de se réenregistrer.
    expect(detecter(creneauxInchanges, EXISTANTS, 'cours-hifz')).toEqual([])
  })

  it('en édition, le conflit avec un AUTRE cours reste détecté', () => {
    const conflits = detecter(
      [{ jour_semaine: '2', heure_debut: '09:30', heure_fin: '10:30' }],
      EXISTANTS,
      'cours-hifz'
    )

    expect(conflits).toHaveLength(1)
    expect(conflits[0]).toMatchObject({ type: 'externe', coursLibelle: 'Lecture Aïcha' })
  })

  it('ignore les lignes incomplètes ou incohérentes en cours de saisie', () => {
    const conflits = detecter(
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
    const conflits = detecter(
      [
        { jour_semaine: '1', heure_debut: '', heure_fin: '' },
        { jour_semaine: '1', heure_debut: '10:30', heure_fin: '11:30' },
      ],
      EXISTANTS
    )

    expect(conflits[0]?.index).toBe(1)
  })

  it('signale plusieurs conflits quand plusieurs créneaux heurtent l’existant', () => {
    const conflits = detecter(
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
      detecter([{ jour_semaine: '1', heure_debut: '10:00', heure_fin: '11:00' }], [])
    ).toEqual([])
  })
})

describe('indexEnConflit', () => {
  it('renvoie les lignes à surligner, les deux côtés pour un conflit interne', () => {
    const conflits = detecter(
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

describe('detecterConflitsFormulaire — deux enseignants', () => {
  it('ne signale rien quand le créneau occupé est celui d’un AUTRE enseignant', () => {
    // L'intention du lot 2 : deux personnes peuvent enseigner en même temps.
    const conflits = detecter(
      [{ jour_semaine: '1', heure_debut: '10:30', heure_fin: '11:30' }],
      EXISTANTS,
      undefined,
      AUTRE_ENSEIGNANT
    )

    expect(conflits).toEqual([])
  })

  it('signale le conflit dès que l’agenda visé est le bon', () => {
    // Même saisie, même base : seul l'enseignant du cours change.
    const conflits = detecter(
      [{ jour_semaine: '1', heure_debut: '10:30', heure_fin: '11:30' }],
      EXISTANTS,
      undefined,
      ENSEIGNANT
    )

    expect(conflits).toHaveLength(1)
    expect(conflits[0]).toMatchObject({ type: 'externe', coursLibelle: 'Groupe Hifz' })
  })

  it('ne retient que les créneaux du bon agenda dans une base mêlée', () => {
    const melange = [
      ...EXISTANTS,
      existant('c4', 'cours-b', 'Tajwid Omar', 1, '10:00:00', '11:00:00', AUTRE_ENSEIGNANT),
    ]

    // Lundi 10:00–11:00 est occupé chez les DEUX enseignants ; chacun ne voit
    // que le sien.
    expect(
      detecter([{ jour_semaine: '1', heure_debut: '10:30', heure_fin: '11:30' }], melange)
    ).toMatchObject([{ coursLibelle: 'Groupe Hifz' }])

    expect(
      detecter(
        [{ jour_semaine: '1', heure_debut: '10:30', heure_fin: '11:30' }],
        melange,
        undefined,
        AUTRE_ENSEIGNANT
      )
    ).toMatchObject([{ coursLibelle: 'Tajwid Omar' }])
  })

  it('détecte toujours les chevauchements INTERNES, quel que soit l’enseignant', () => {
    // Deux lignes du même formulaire décrivent forcément le même agenda.
    const conflits = detecter(
      [
        { jour_semaine: '5', heure_debut: '14:00', heure_fin: '15:30' },
        { jour_semaine: '5', heure_debut: '15:00', heure_fin: '16:00' },
      ],
      EXISTANTS,
      undefined,
      AUTRE_ENSEIGNANT
    )

    expect(conflits).toHaveLength(1)
    expect(conflits[0]).toMatchObject({ type: 'interne', index: 1, autreIndex: 0 })
  })
})

describe('detecterConflitsFormulaire — deux sessions', () => {
  /*
   * Le cas qui rend la reconduction possible : on ouvre la session suivante et
   * on y repose les mêmes horaires. Les cours de la session précédente ne
   * doivent pas s'y opposer.
   */
  it('ne signale rien contre un cours d’une AUTRE session', () => {
    const conflits = detecter(
      [{ jour_semaine: 1, heure_debut: '10:00', heure_fin: '11:00' }],
      EXISTANTS,
      undefined,
      ENSEIGNANT,
      'session-2'
    )

    expect(conflits).toHaveLength(0)
  })

  it('signale toujours le conflit à l’intérieur de la session', () => {
    const conflits = detecter([{ jour_semaine: 1, heure_debut: '10:00', heure_fin: '11:00' }])

    expect(conflits).toHaveLength(1)
    expect(conflits[0]).toMatchObject({ type: 'externe', coursLibelle: 'Groupe Hifz' })
  })

  it('signale les chevauchements internes quelle que soit la session', () => {
    // Les lignes d'un même formulaire partagent forcément la même session : le
    // scope ne doit pas les dispenser du contrôle entre elles.
    const conflits = detecter(
      [
        { jour_semaine: 4, heure_debut: '10:00', heure_fin: '11:00' },
        { jour_semaine: 4, heure_debut: '10:30', heure_fin: '11:30' },
      ],
      EXISTANTS,
      undefined,
      ENSEIGNANT,
      'session-2'
    )

    expect(conflits.filter((c) => c.type === 'interne')).toHaveLength(1)
  })
})
