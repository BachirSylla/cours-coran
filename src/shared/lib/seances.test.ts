import { describe, expect, it } from 'vitest'

import {
  chaineDepuisDate,
  cleOccurrence,
  dateDepuisChaine,
  fusionnerAvecSeances,
  genererOccurrences,
  normaliserHeure,
  type CreneauSource,
  type SeanceRapprochable,
} from '@/shared/lib/seances'
import type { JourSemaine } from '@/shared/lib/conflits'

// Repères : 2026-07-27 est un lundi, 2026-08-02 un dimanche.
const LUNDI = '2026-07-27'
const DIMANCHE = '2026-08-02'
const SEMAINE = { debut: LUNDI, fin: DIMANCHE }

function creneau(
  jour_semaine: JourSemaine,
  heure_debut = '10:00:00',
  heure_fin = '11:00:00',
  cours_id = 'cours-1'
): CreneauSource {
  return { cours_id, jour_semaine, heure_debut, heure_fin }
}

function seance(
  date: string,
  heure_debut: string,
  cours_id = 'cours-1'
): SeanceRapprochable & { id: string } {
  return { id: `${cours_id}-${date}-${heure_debut}`, cours_id, date, heure_debut }
}

describe('normaliserHeure', () => {
  it('ramène toutes les formes à HH:MM', () => {
    expect(normaliserHeure('10:00:00')).toBe('10:00')
    expect(normaliserHeure('10:00')).toBe('10:00')
    expect(normaliserHeure('  09:30:00  ')).toBe('09:30')
  })
})

describe('dateDepuisChaine / chaineDepuisDate', () => {
  it('fait l’aller-retour sans décalage de fuseau', () => {
    expect(chaineDepuisDate(dateDepuisChaine('2026-07-28'))).toBe('2026-07-28')
    // Le 1er janvier est le cas qui casse quand on passe par UTC.
    expect(chaineDepuisDate(dateDepuisChaine('2026-01-01'))).toBe('2026-01-01')
  })

  it('construit une date locale, pas UTC', () => {
    const date = dateDepuisChaine('2026-07-28')

    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(6)
    expect(date.getDate()).toBe(28)
  })

  it('rejette un format invalide', () => {
    expect(() => dateDepuisChaine('28/07/2026')).toThrow(/Date invalide/)
  })
})

describe('genererOccurrences', () => {
  it('produit une occurrence par semaine pour un créneau', () => {
    const occurrences = genererOccurrences([creneau(3)], '2026-07-01', null, {
      debut: '2026-07-01',
      fin: '2026-07-31',
    })

    // Mercredis de juillet 2026 : 1, 8, 15, 22, 29.
    expect(occurrences.map((o) => o.date)).toEqual([
      '2026-07-01',
      '2026-07-08',
      '2026-07-15',
      '2026-07-22',
      '2026-07-29',
    ])
  })

  it('démarre à la date de début même en milieu de semaine', () => {
    // Le cours démarre le mercredi 29/07 : le mardi 28 ne compte pas.
    const occurrences = genererOccurrences([creneau(2), creneau(3)], '2026-07-29', null, {
      debut: LUNDI,
      fin: DIMANCHE,
    })

    expect(occurrences.map((o) => o.date)).toEqual(['2026-07-29'])
  })

  it('est borné par la fenêtre quand date_fin est nulle (cours en cours)', () => {
    const occurrences = genererOccurrences([creneau(1)], '2020-01-01', null, SEMAINE)

    expect(occurrences).toHaveLength(1)
    expect(occurrences[0]?.date).toBe(LUNDI)
  })

  it('s’arrête à date_fin quand elle coupe la fenêtre', () => {
    const occurrences = genererOccurrences([creneau(3)], '2026-07-01', '2026-07-15', {
      debut: '2026-07-01',
      fin: '2026-07-31',
    })

    expect(occurrences.map((o) => o.date)).toEqual(['2026-07-01', '2026-07-08', '2026-07-15'])
  })

  it('inclut les deux bornes de la fenêtre', () => {
    const lundi = genererOccurrences([creneau(1)], '2020-01-01', null, SEMAINE)
    const dimanche = genererOccurrences([creneau(7)], '2020-01-01', null, SEMAINE)

    expect(lundi.map((o) => o.date)).toEqual([LUNDI])
    expect(dimanche.map((o) => o.date)).toEqual([DIMANCHE])
  })

  it('inclut une occurrence tombant exactement sur date_fin', () => {
    const occurrences = genererOccurrences([creneau(1)], '2020-01-01', LUNDI, SEMAINE)

    expect(occurrences.map((o) => o.date)).toEqual([LUNDI])
  })

  it('gère un cours 2×/semaine (deux créneaux)', () => {
    const occurrences = genererOccurrences(
      [creneau(1, '10:00:00', '11:00:00'), creneau(3, '15:00:00', '16:00:00')],
      '2020-01-01',
      null,
      SEMAINE
    )

    expect(occurrences.map((o) => `${o.date} ${o.heure_debut}`)).toEqual([
      '2026-07-27 10:00:00',
      '2026-07-29 15:00:00',
    ])
  })

  it('trie par date puis par heure de début', () => {
    const occurrences = genererOccurrences(
      [creneau(3, '15:00:00', '16:00:00'), creneau(3, '08:00:00', '09:00:00'), creneau(1)],
      '2020-01-01',
      null,
      SEMAINE
    )

    expect(occurrences.map((o) => `${o.date} ${o.heure_debut}`)).toEqual([
      '2026-07-27 10:00:00',
      '2026-07-29 08:00:00',
      '2026-07-29 15:00:00',
    ])
  })

  it('ne renvoie rien quand la fenêtre précède le cours', () => {
    expect(genererOccurrences([creneau(1)], '2026-08-10', null, SEMAINE)).toEqual([])
  })

  it('ne renvoie rien quand la fenêtre suit la fin du cours', () => {
    expect(genererOccurrences([creneau(1)], '2020-01-01', '2026-07-01', SEMAINE)).toEqual([])
  })

  it('ne renvoie rien pour une fenêtre trop courte pour contenir le jour', () => {
    // Fenêtre lundi → mercredi, créneau le vendredi.
    const occurrences = genererOccurrences([creneau(5)], '2020-01-01', null, {
      debut: LUNDI,
      fin: '2026-07-29',
    })

    expect(occurrences).toEqual([])
  })

  it('ne renvoie rien sans créneau', () => {
    expect(genererOccurrences([], '2020-01-01', null, SEMAINE)).toEqual([])
  })

  it('traverse les mois', () => {
    const occurrences = genererOccurrences([creneau(5)], '2026-07-01', null, {
      debut: '2026-07-27',
      fin: '2026-08-10',
    })

    expect(occurrences.map((o) => o.date)).toEqual(['2026-07-31', '2026-08-07'])
  })

  it('traverse les années', () => {
    const occurrences = genererOccurrences([creneau(4)], '2026-01-01', null, {
      debut: '2026-12-28',
      fin: '2027-01-10',
    })

    // Jeudis : 31/12/2026, 07/01/2027.
    expect(occurrences.map((o) => o.date)).toEqual(['2026-12-31', '2027-01-07'])
  })

  it('conserve les heures du créneau', () => {
    const occurrences = genererOccurrences(
      [creneau(1, '08:15:00', '09:45:00')],
      '2020-01-01',
      null,
      SEMAINE
    )

    expect(occurrences[0]).toMatchObject({
      heure_debut: '08:15:00',
      heure_fin: '09:45:00',
      jour_semaine: 1,
      cours_id: 'cours-1',
    })
  })
})

describe('cleOccurrence', () => {
  it('confond les formats d’heure', () => {
    expect(cleOccurrence({ cours_id: 'c', date: '2026-07-27', heure_debut: '10:00:00' })).toBe(
      cleOccurrence({ cours_id: 'c', date: '2026-07-27', heure_debut: '10:00' })
    )
  })

  it('distingue deux cours au même horaire', () => {
    expect(cleOccurrence({ cours_id: 'a', date: '2026-07-27', heure_debut: '10:00' })).not.toBe(
      cleOccurrence({ cours_id: 'b', date: '2026-07-27', heure_debut: '10:00' })
    )
  })
})

describe('fusionnerAvecSeances', () => {
  const occurrences = genererOccurrences([creneau(1), creneau(3)], '2020-01-01', null, SEMAINE)

  it('marque les occurrences non saisies', () => {
    const vues = fusionnerAvecSeances(occurrences, [])

    expect(vues).toHaveLength(2)
    expect(vues.every((vue) => !vue.saisie && vue.seance === null)).toBe(true)
    expect(vues.every((vue) => !vue.orpheline)).toBe(true)
  })

  it('rattache une séance enregistrée à son occurrence', () => {
    const existante = seance(LUNDI, '10:00:00')
    const vues = fusionnerAvecSeances(occurrences, [existante])

    expect(vues).toHaveLength(2)
    expect(vues[0]).toMatchObject({ date: LUNDI, saisie: true, orpheline: false })
    expect(vues[0]?.seance).toBe(existante)
    expect(vues[1]?.saisie).toBe(false)
  })

  it('rapproche malgré des formats d’heure différents', () => {
    // La base renvoie 10:00:00, le formulaire manipule 10:00.
    const vues = fusionnerAvecSeances(
      [
        {
          cours_id: 'cours-1',
          date: LUNDI,
          jour_semaine: 1,
          heure_debut: '10:00',
          heure_fin: '11:00',
        },
      ],
      [seance(LUNDI, '10:00:00')]
    )

    expect(vues[0]?.saisie).toBe(true)
  })

  it('conserve une séance sans occurrence et la marque orpheline', () => {
    // Le créneau a été déplacé depuis : l'historique doit rester visible.
    const deplacee = seance('2026-07-28', '14:00:00')
    const vues = fusionnerAvecSeances(occurrences, [deplacee])

    expect(vues).toHaveLength(3)
    const orpheline = vues.find((vue) => vue.orpheline)
    expect(orpheline).toMatchObject({ date: '2026-07-28', saisie: true, jour_semaine: null })
    expect(orpheline?.seance).toBe(deplacee)
  })

  it('ne mélange pas deux cours au même horaire le même jour', () => {
    const deuxCours = genererOccurrences(
      [creneau(1, '10:00:00', '11:00:00', 'cours-1')],
      '2020-01-01',
      null,
      SEMAINE
    ).concat(
      genererOccurrences(
        [creneau(1, '10:00:00', '11:00:00', 'cours-2')],
        '2020-01-01',
        null,
        SEMAINE
      )
    )

    const vues = fusionnerAvecSeances(deuxCours, [seance(LUNDI, '10:00:00', 'cours-2')])

    expect(vues.filter((vue) => vue.saisie)).toHaveLength(1)
    expect(vues.find((vue) => vue.saisie)?.cours_id).toBe('cours-2')
  })

  it('trie le résultat par date puis heure, orphelines comprises', () => {
    const vues = fusionnerAvecSeances(occurrences, [seance('2026-07-28', '14:00:00')])

    expect(vues.map((vue) => vue.date)).toEqual([LUNDI, '2026-07-28', '2026-07-29'])
  })

  it('accepte les deux ensembles vides', () => {
    expect(fusionnerAvecSeances([], [])).toEqual([])
  })

  it('renvoie uniquement des orphelines quand il n’y a aucune occurrence', () => {
    const vues = fusionnerAvecSeances([], [seance(LUNDI, '10:00:00')])

    expect(vues).toHaveLength(1)
    expect(vues[0]?.orpheline).toBe(true)
  })
})
