import { describe, expect, it } from 'vitest'

import {
  notationSchema,
  valeursParDefaut,
  type NotationFormValues,
} from '@/features/parametres/notationSchema'
import { NOTATION_PAR_DEFAUT, TOTAL_NOTE_FINALE } from '@/shared/lib/rapport'

function saisie(extra: Partial<NotationFormValues> = {}): NotationFormValues {
  return {
    bareme_assiduite: '3',
    penalite_absence: '0,5',
    penalite_retard: '0,25',
    penaliser_absences_excusees: false,
    base_academique: 'moyenne_devoirs_examen',
    assiduite_active: true,
    ...extra,
  }
}

function messagePour(valeurs: NotationFormValues): string | undefined {
  const resultat = notationSchema.safeParse(valeurs)

  return resultat.success ? undefined : resultat.error.issues[0]?.message
}

describe('notationSchema', () => {
  it('déduit la part académique de la part d’assiduité', () => {
    // La somme ne peut pas être fausse : elle n'est jamais saisie.
    expect(notationSchema.parse(saisie()).bareme_academique).toBe(17)
    expect(notationSchema.parse(saisie({ bareme_assiduite: '5' })).bareme_academique).toBe(15)
    expect(notationSchema.parse(saisie({ bareme_assiduite: '0' })).bareme_academique).toBe(20)
  })

  it('produit toujours une somme égale au total', () => {
    for (const assiduite of ['0', '3', '7', '20']) {
      const config = notationSchema.parse(saisie({ bareme_assiduite: assiduite }))

      expect(config.bareme_academique + config.bareme_assiduite).toBe(TOTAL_NOTE_FINALE)
    }
  })

  it('accepte la virgule décimale française pour les pénalités', () => {
    const config = notationSchema.parse(
      saisie({ penalite_absence: '1,25', penalite_retard: '0,75' })
    )

    expect(config.penalite_absence).toBe(1.25)
    expect(config.penalite_retard).toBe(0.75)
  })

  it('accepte le point décimal aussi', () => {
    expect(notationSchema.parse(saisie({ penalite_absence: '1.5' })).penalite_absence).toBe(1.5)
  })

  it('refuse une part d’assiduité au-dessus du total', () => {
    expect(messagePour(saisie({ bareme_assiduite: '21' }))).toBe(
      "La part d'assiduité doit être un entier entre 0 et 20."
    )
  })

  it('refuse une part d’assiduité négative ou décimale', () => {
    expect(messagePour(saisie({ bareme_assiduite: '-1' }))).toContain("part d'assiduité")
    expect(messagePour(saisie({ bareme_assiduite: '2,5' }))).toContain("part d'assiduité")
  })

  it('refuse une pénalité négative', () => {
    expect(messagePour(saisie({ penalite_absence: '-1' }))).toBe(
      'La pénalité par absence doit être comprise entre 0 et 20.'
    )
    expect(messagePour(saisie({ penalite_retard: '-0,5' }))).toContain('pénalité par retard')
  })

  it('refuse un champ vide ou non numérique', () => {
    expect(messagePour(saisie({ penalite_absence: '' }))).toBe(
      'La pénalité par absence doit être un nombre.'
    )
    expect(messagePour(saisie({ bareme_assiduite: 'trois' }))).toBe(
      "La part d'assiduité doit être un nombre."
    )
  })

  it('transporte la base de la note académique', () => {
    expect(notationSchema.parse(saisie()).base_academique).toBe('moyenne_devoirs_examen')
    expect(
      notationSchema.parse(saisie({ base_academique: 'examen_seul' })).base_academique
    ).toBe('examen_seul')
  })

  it('refuse une base inconnue', () => {
    expect(messagePour(saisie({ base_academique: 'devoirs_seuls' as 'examen_seul' }))).toBe(
      'Base de notation inconnue.'
    )
  })

  it('transporte le choix sur les absences excusées', () => {
    expect(
      notationSchema.parse(saisie({ penaliser_absences_excusees: true }))
        .penaliser_absences_excusees
    ).toBe(true)
  })
})

describe('valeursParDefaut', () => {
  it('remplit le formulaire depuis les réglages en vigueur', () => {
    expect(valeursParDefaut(NOTATION_PAR_DEFAUT)).toEqual({
      bareme_assiduite: '3',
      penalite_absence: '0,5',
      penalite_retard: '0,25',
      penaliser_absences_excusees: false,
      base_academique: 'moyenne_devoirs_examen',
      assiduite_active: true,
    })
  })

  it('fait un aller-retour sans rien perdre', () => {
    const config = { ...NOTATION_PAR_DEFAUT, bareme_academique: 15, bareme_assiduite: 5 }

    expect(notationSchema.parse(valeursParDefaut(config))).toEqual(config)
  })
})
