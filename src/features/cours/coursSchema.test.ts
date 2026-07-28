import { describe, expect, it } from 'vitest'

import {
  abregeJour,
  coursSchema,
  creneauParDefaut,
  JOURS_SEMAINE,
  libelleJour,
  valeursParDefaut,
} from '@/features/cours/coursSchema'

// UUID v4 réel : zod contrôle les bits de version et de variante.
const TYPE_ID = '3f1c0e2a-9d4b-4f7e-8a12-2b6c9d0e4f55'

const minimal = {
  libelle: 'Groupe Hifz',
  type_cours_id: TYPE_ID,
  format: 'groupe',
  date_debut: '2026-07-27',
  creneaux: [{ jour_semaine: '1', heure_debut: '10:00', heure_fin: '11:00' }],
}

function messagePour(donnees: unknown, chemin: string): string | undefined {
  const resultat = coursSchema.safeParse(donnees)
  if (resultat.success) return undefined
  return resultat.error.issues.find((issue) => issue.path.join('.') === chemin)?.message
}

describe('coursSchema — champs du cours', () => {
  it('accepte le minimum requis', () => {
    expect(coursSchema.safeParse(minimal).success).toBe(true)
  })

  it('applique les valeurs par défaut (devise XOF, statut actif)', () => {
    const resultat = coursSchema.parse(minimal)

    expect(resultat.devise).toBe('XOF')
    expect(resultat.statut).toBe('actif')
  })

  it('exige un libellé et un type de cours', () => {
    expect(messagePour({ ...minimal, libelle: '  ' }, 'libelle')).toBe(
      'Le libellé est obligatoire.'
    )
    expect(messagePour({ ...minimal, type_cours_id: '' }, 'type_cours_id')).toBe(
      'Le type de cours est obligatoire.'
    )
    expect(messagePour({ ...minimal, type_cours_id: 'pas-un-uuid' }, 'type_cours_id')).toBe(
      'Type de cours invalide.'
    )
  })

  it('n’accepte que les formats individuel et groupe', () => {
    expect(coursSchema.safeParse({ ...minimal, format: 'individuel' }).success).toBe(true)
    expect(messagePour({ ...minimal, format: 'duo' }, 'format')).toBe('Format invalide.')
  })

  it('exige une date de début valide', () => {
    expect(messagePour({ ...minimal, date_debut: '' }, 'date_debut')).toBe(
      'La date de début est obligatoire.'
    )
    expect(messagePour({ ...minimal, date_debut: '27/07/2026' }, 'date_debut')).toBe(
      'La date de début est invalide.'
    )
  })

  it('accepte une date de fin absente (cours en cours)', () => {
    const resultat = coursSchema.parse({ ...minimal, date_fin: '' })

    expect(resultat.date_fin).toBeNull()
  })

  it('refuse une date de fin antérieure à la date de début', () => {
    expect(messagePour({ ...minimal, date_fin: '2026-07-26' }, 'date_fin')).toBe(
      'La date de fin doit être après la date de début.'
    )
  })

  it('accepte une date de fin égale ou postérieure', () => {
    expect(coursSchema.safeParse({ ...minimal, date_fin: '2026-07-27' }).success).toBe(true)
    expect(coursSchema.safeParse({ ...minimal, date_fin: '2027-01-01' }).success).toBe(true)
  })

  it('valide le lien Meet quand il est présent', () => {
    expect(coursSchema.parse({ ...minimal, lien_meet: '' }).lien_meet).toBeNull()
    expect(
      coursSchema.parse({ ...minimal, lien_meet: 'https://meet.google.com/abc-defg-hij' })
        .lien_meet
    ).toBe('https://meet.google.com/abc-defg-hij')
    expect(messagePour({ ...minimal, lien_meet: 'meet google' }, 'lien_meet')).toBe(
      'Le lien doit être une URL valide (https://…).'
    )
  })

  it('convertit le prix mensuel et refuse les valeurs négatives ou non numériques', () => {
    expect(coursSchema.parse({ ...minimal, prix_mensuel: '' }).prix_mensuel).toBeNull()
    expect(coursSchema.parse({ ...minimal, prix_mensuel: '15000' }).prix_mensuel).toBe(15000)
    // Séparateur décimal français
    expect(coursSchema.parse({ ...minimal, prix_mensuel: '99,5' }).prix_mensuel).toBe(99.5)
    expect(messagePour({ ...minimal, prix_mensuel: '-1' }, 'prix_mensuel')).toBe(
      'Le prix mensuel doit être un nombre positif.'
    )
    expect(messagePour({ ...minimal, prix_mensuel: 'gratuit' }, 'prix_mensuel')).toBe(
      'Le prix mensuel doit être un nombre positif.'
    )
  })

  it('exige une devise de 3 caractères', () => {
    expect(messagePour({ ...minimal, devise: 'EU' }, 'devise')).toBe(
      'La devise doit comporter 3 lettres (ex. XOF).'
    )
  })
})

describe('coursSchema — créneaux', () => {
  it('refuse un cours sans créneau', () => {
    expect(messagePour({ ...minimal, creneaux: [] }, 'creneaux')).toBe(
      'Ajoutez au moins un créneau hebdomadaire.'
    )
  })

  it('accepte plusieurs créneaux (2×/semaine = deux lignes)', () => {
    const resultat = coursSchema.parse({
      ...minimal,
      creneaux: [
        { jour_semaine: '1', heure_debut: '10:00', heure_fin: '11:00' },
        { jour_semaine: '3', heure_debut: '15:00', heure_fin: '16:00' },
      ],
    })

    expect(resultat.creneaux).toHaveLength(2)
  })

  it('convertit le jour en nombre', () => {
    const resultat = coursSchema.parse(minimal)

    expect(resultat.creneaux[0]?.jour_semaine).toBe(1)
  })

  it('refuse un jour hors 1–7', () => {
    expect(
      messagePour(
        {
          ...minimal,
          creneaux: [{ jour_semaine: '8', heure_debut: '10:00', heure_fin: '11:00' }],
        },
        'creneaux.0.jour_semaine'
      )
    ).toBe('Jour invalide.')

    expect(
      messagePour(
        {
          ...minimal,
          creneaux: [{ jour_semaine: '0', heure_debut: '10:00', heure_fin: '11:00' }],
        },
        'creneaux.0.jour_semaine'
      )
    ).toBe('Jour invalide.')
  })

  it('refuse une heure de fin antérieure ou égale au début', () => {
    expect(
      messagePour(
        {
          ...minimal,
          creneaux: [{ jour_semaine: '1', heure_debut: '11:00', heure_fin: '10:00' }],
        },
        'creneaux.0.heure_fin'
      )
    ).toBe("L'heure de fin doit être après l'heure de début.")

    expect(
      messagePour(
        {
          ...minimal,
          creneaux: [{ jour_semaine: '1', heure_debut: '11:00', heure_fin: '11:00' }],
        },
        'creneaux.0.heure_fin'
      )
    ).toBe("L'heure de fin doit être après l'heure de début.")
  })

  it('refuse une heure mal formée', () => {
    expect(
      messagePour(
        {
          ...minimal,
          creneaux: [{ jour_semaine: '1', heure_debut: '10h', heure_fin: '11:00' }],
        },
        'creneaux.0.heure_debut'
      )
    ).toBe('Heure invalide (format HH:MM).')
  })

  it('accepte le format HH:MM:SS renvoyé par Postgres', () => {
    expect(
      coursSchema.safeParse({
        ...minimal,
        creneaux: [{ jour_semaine: '1', heure_debut: '10:00:00', heure_fin: '11:00:00' }],
      }).success
    ).toBe(true)
  })
})

describe('valeurs par défaut et libellés', () => {
  it('propose un formulaire avec un créneau prêt à remplir', () => {
    const defauts = valeursParDefaut()

    expect(defauts.creneaux).toHaveLength(1)
    expect(defauts.devise).toBe('XOF')
    // Le type de cours reste à choisir : le formulaire s'ouvre donc invalide.
    expect(coursSchema.safeParse(defauts).success).toBe(false)
    expect(
      coursSchema.safeParse({ ...defauts, libelle: 'X', type_cours_id: TYPE_ID }).success
    ).toBe(true)
  })

  it('crée un créneau par défaut cohérent', () => {
    expect(creneauParDefaut()).toEqual({
      jour_semaine: '1',
      heure_debut: '10:00',
      heure_fin: '11:00',
    })
  })

  it('nomme les 7 jours ISO (1 = lundi, 7 = dimanche)', () => {
    expect(JOURS_SEMAINE).toHaveLength(7)
    expect(libelleJour(1)).toBe('Lundi')
    expect(libelleJour(7)).toBe('Dimanche')
    expect(abregeJour(3)).toBe('Mer')
  })
})
