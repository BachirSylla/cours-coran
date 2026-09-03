import { describe, expect, it } from 'vitest'

import {
  calculerPlageHoraire,
  construireBlocs,
  couleurCours,
  extraireCreneaux,
  formaterHeure,
  heuresDeLaPlage,
  idsEnConflit,
  joursEnConflit,
  PIXELS_PAR_MINUTE,
  PLAGE_PAR_DEFAUT,
  repartirEnVoies,
  type CreneauPlanning,
} from '@/features/planning/grilleHoraire'
import type { JourSemaine } from '@/shared/lib/conflits'
import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'

/** Centre à un enseignant, sauf mention contraire — la situation d'aujourd'hui. */
const ENSEIGNANT = 'ens-a'
const AUTRE_ENSEIGNANT = 'ens-b'

function creneau(
  id: string,
  jour_semaine: JourSemaine,
  heure_debut: string,
  heure_fin: string,
  cours_id = `cours-${id}`,
  enseignant_id: string | null = ENSEIGNANT,
  session_id = 'session-1'
): CreneauPlanning {
  return { id, cours_id, enseignant_id, session_id, jour_semaine, heure_debut, heure_fin }
}

function cours(
  id: string,
  libelle: string,
  creneaux: { id: string; jour_semaine: number; heure_debut: string; heure_fin: string }[],
  extra?: Partial<CoursAvecDetails>
): CoursAvecDetails {
  return {
    id,
    centre_id: 'centre-1',
    libelle,
    type_cours_id: 'type-1',
    format: 'groupe',
    date_debut: '2026-07-27',
    date_fin: null,
    lien_meet: null,
    jeton_partage: null,
    session_id: 'session-1',
    niveau: null,
    reconduit_de: null,
    enseignant_id: null,
    logo: null,
    assiduite_active: null,
    base_academique: null,
    bareme_assiduite: null,
    penalite_absence: null,
    penalite_retard: null,
    penaliser_absences_excusees: null,
    statut: 'actif',
    created_at: '2026-07-27T10:00:00Z',
    updated_at: '2026-07-27T10:00:00Z',
    type_cours: { libelle: 'Mémorisation' },
    inscription: [{ count: 0 }],
    tarif: [],
    creneau: creneaux.map((c) => ({
      ...c,
      centre_id: 'centre-1',
      cours_id: id,
      created_at: '2026-07-27T10:00:00Z',
      updated_at: '2026-07-27T10:00:00Z',
    })),
    ...extra,
  }
}

describe('formaterHeure', () => {
  it('tronque les secondes renvoyées par Postgres', () => {
    expect(formaterHeure('10:00:00')).toBe('10:00')
    expect(formaterHeure('09:30')).toBe('09:30')
  })
})

describe('calculerPlageHoraire', () => {
  it('retombe sur 7h–21h quand il n’y a aucun créneau', () => {
    expect(calculerPlageHoraire([])).toEqual(PLAGE_PAR_DEFAUT)
  })

  it('englobe les créneaux avec une heure de marge, arrondie à l’heure', () => {
    const plage = calculerPlageHoraire([
      creneau('a', 1, '10:20:00', '11:10:00'),
      creneau('b', 3, '15:00:00', '16:30:00'),
    ])

    expect(plage).toEqual({ debutMinutes: 9 * 60, finMinutes: 18 * 60 })
  })

  it('ne déborde jamais de la journée', () => {
    const plage = calculerPlageHoraire([creneau('a', 1, '00:15:00', '23:45:00')])

    expect(plage).toEqual({ debutMinutes: 0, finMinutes: 24 * 60 })
  })
})

describe('heuresDeLaPlage', () => {
  it('liste les heures pleines, bornes comprises', () => {
    expect(heuresDeLaPlage({ debutMinutes: 9 * 60, finMinutes: 12 * 60 })).toEqual([
      9, 10, 11, 12,
    ])
  })
})

describe('idsEnConflit', () => {
  it('ne signale rien sur des créneaux disjoints', () => {
    const ids = idsEnConflit([
      creneau('a', 1, '09:00', '10:00'),
      creneau('b', 1, '14:00', '15:00'),
    ])

    expect(ids.size).toBe(0)
  })

  it('ne signale rien sur des créneaux adjacents (aucune marge)', () => {
    const ids = idsEnConflit([
      creneau('a', 1, '10:00', '11:00'),
      creneau('b', 1, '11:00', '12:00'),
    ])

    expect(ids.size).toBe(0)
  })

  it('ne signale rien entre deux jours différents', () => {
    const ids = idsEnConflit([
      creneau('a', 1, '10:00', '11:00'),
      creneau('b', 2, '10:00', '11:00'),
    ])

    expect(ids.size).toBe(0)
  })

  it('marque les deux créneaux d’un chevauchement', () => {
    const ids = idsEnConflit([
      creneau('a', 1, '10:00', '11:30'),
      creneau('b', 1, '11:00', '12:00'),
      creneau('c', 1, '15:00', '16:00'),
    ])

    expect([...ids].sort()).toEqual(['a', 'b'])
  })

  it('ne marque rien quand le chevauchement oppose deux enseignants', () => {
    // La grille cesserait sinon de colorer en rouge deux cours parfaitement
    // légitimes, tenus au même moment par deux personnes différentes.
    const ids = idsEnConflit([
      creneau('a', 1, '10:00', '11:30', 'cours-a', ENSEIGNANT),
      creneau('b', 1, '11:00', '12:00', 'cours-b', AUTRE_ENSEIGNANT),
    ])

    expect(ids.size).toBe(0)
  })

  it('marque le double-booking de chaque enseignant, et lui seul', () => {
    const ids = idsEnConflit([
      creneau('a1', 1, '10:00', '11:30', 'cours-a1', ENSEIGNANT),
      creneau('a2', 1, '11:00', '12:00', 'cours-a2', ENSEIGNANT),
      creneau('b1', 1, '10:30', '11:15', 'cours-b1', AUTRE_ENSEIGNANT),
    ])

    expect([...ids].sort()).toEqual(['a1', 'a2'])
  })
})

describe('repartirEnVoies', () => {
  it('donne une voie unique à un créneau isolé', () => {
    const voies = repartirEnVoies([creneau('a', 1, '10:00', '11:00')])

    expect(voies.get('a')).toEqual({ voie: 0, nbVoies: 1 })
  })

  it('garde une seule voie pour des créneaux disjoints', () => {
    const voies = repartirEnVoies([
      creneau('a', 1, '09:00', '10:00'),
      creneau('b', 1, '14:00', '15:00'),
    ])

    expect(voies.get('a')).toEqual({ voie: 0, nbVoies: 1 })
    expect(voies.get('b')).toEqual({ voie: 0, nbVoies: 1 })
  })

  it('garde une seule voie pour des créneaux adjacents', () => {
    const voies = repartirEnVoies([
      creneau('a', 1, '10:00', '11:00'),
      creneau('b', 1, '11:00', '12:00'),
    ])

    expect(voies.get('a')?.nbVoies).toBe(1)
    expect(voies.get('b')?.nbVoies).toBe(1)
  })

  it('sépare deux créneaux qui se chevauchent en deux voies', () => {
    const voies = repartirEnVoies([
      creneau('a', 1, '10:00', '11:30'),
      creneau('b', 1, '11:00', '12:00'),
    ])

    expect(voies.get('a')).toEqual({ voie: 0, nbVoies: 2 })
    expect(voies.get('b')).toEqual({ voie: 1, nbVoies: 2 })
  })

  it('gère trois créneaux qui se recouvrent tous', () => {
    const voies = repartirEnVoies([
      creneau('a', 1, '10:00', '12:00'),
      creneau('b', 1, '10:30', '12:00'),
      creneau('c', 1, '11:00', '12:00'),
    ])

    expect(voies.get('a')).toEqual({ voie: 0, nbVoies: 3 })
    expect(voies.get('b')).toEqual({ voie: 1, nbVoies: 3 })
    expect(voies.get('c')).toEqual({ voie: 2, nbVoies: 3 })
  })

  it('réutilise une voie libérée dans une cascade', () => {
    // a et b se chevauchent ; c commence après la fin de a, mais pendant b.
    const voies = repartirEnVoies([
      creneau('a', 1, '10:00', '11:00'),
      creneau('b', 1, '10:30', '12:00'),
      creneau('c', 1, '11:00', '11:30'),
    ])

    expect(voies.get('c')?.voie).toBe(0)
    expect(voies.get('a')?.nbVoies).toBe(2)
  })

  it('ne mélange pas deux groupes indépendants', () => {
    const voies = repartirEnVoies([
      creneau('a', 1, '09:00', '10:30'),
      creneau('b', 1, '10:00', '11:00'),
      creneau('c', 1, '15:00', '16:00'),
    ])

    expect(voies.get('a')?.nbVoies).toBe(2)
    expect(voies.get('c')).toEqual({ voie: 0, nbVoies: 1 })
  })

  it('accepte une liste vide', () => {
    expect(repartirEnVoies([]).size).toBe(0)
  })
})

describe('couleurCours', () => {
  it('renvoie toujours un index de la palette 1–5', () => {
    for (const id of ['a', 'cours-1', '3f1c0e2a-9d4b-4f7e-8a12-2b6c9d0e4f55', '']) {
      const couleur = couleurCours(id)
      expect(couleur).toBeGreaterThanOrEqual(1)
      expect(couleur).toBeLessThanOrEqual(5)
    }
  })

  it('est déterministe pour un même identifiant', () => {
    expect(couleurCours('cours-hifz')).toBe(couleurCours('cours-hifz'))
  })

  it('distingue des identifiants proches', () => {
    const couleurs = new Set(['cours-1', 'cours-2', 'cours-3', 'cours-4'].map(couleurCours))
    expect(couleurs.size).toBeGreaterThan(1)
  })
})

describe('extraireCreneaux', () => {
  it('met à plat les créneaux de tous les cours', () => {
    const creneaux = extraireCreneaux([
      cours('c1', 'Hifz', [
        { id: 'x', jour_semaine: 1, heure_debut: '10:00:00', heure_fin: '11:00:00' },
        { id: 'y', jour_semaine: 3, heure_debut: '15:00:00', heure_fin: '16:00:00' },
      ]),
      cours('c2', 'Lecture', [
        { id: 'z', jour_semaine: 2, heure_debut: '09:00:00', heure_fin: '10:00:00' },
      ]),
    ])

    expect(creneaux).toHaveLength(3)
    expect(creneaux[0]).toMatchObject({ id: 'x', cours_id: 'c1', jour_semaine: 1 })
  })
})

describe('construireBlocs', () => {
  const plage = { debutMinutes: 9 * 60, finMinutes: 18 * 60 }

  it('positionne un bloc proportionnellement aux minutes', () => {
    const blocs = construireBlocs(
      [
        cours('c1', 'Hifz', [
          { id: 'x', jour_semaine: 1, heure_debut: '10:00:00', heure_fin: '11:00:00' },
        ]),
      ],
      plage
    )

    expect(blocs).toHaveLength(1)
    expect(blocs[0]).toMatchObject({
      creneauId: 'x',
      coursId: 'c1',
      libelle: 'Hifz',
      typeLibelle: 'Mémorisation',
      jour: 1,
      heureDebut: '10:00',
      heureFin: '11:00',
      top: 60 * PIXELS_PAR_MINUTE,
      hauteur: 60 * PIXELS_PAR_MINUTE,
      enConflit: false,
    })
  })

  it('gère des minutes arbitraires', () => {
    const blocs = construireBlocs(
      [
        cours('c1', 'Hifz', [
          { id: 'x', jour_semaine: 2, heure_debut: '10:20:00', heure_fin: '11:10:00' },
        ]),
      ],
      plage
    )

    expect(blocs[0]?.top).toBe(80 * PIXELS_PAR_MINUTE)
    expect(blocs[0]?.hauteur).toBe(50 * PIXELS_PAR_MINUTE)
  })

  it('marque les blocs en conflit et les répartit en voies', () => {
    const blocs = construireBlocs(
      [
        cours('c1', 'Hifz', [
          { id: 'x', jour_semaine: 1, heure_debut: '10:00:00', heure_fin: '11:30:00' },
        ]),
        cours('c2', 'Lecture', [
          { id: 'y', jour_semaine: 1, heure_debut: '11:00:00', heure_fin: '12:00:00' },
        ]),
      ],
      plage
    )

    expect(blocs.every((bloc) => bloc.enConflit)).toBe(true)
    expect(blocs.every((bloc) => bloc.nbVoies === 2)).toBe(true)
    expect(blocs.map((bloc) => bloc.voie).sort()).toEqual([0, 1])
  })

  it('laisse les créneaux adjacents pleine largeur et sans alerte', () => {
    const blocs = construireBlocs(
      [
        cours('c1', 'Hifz', [
          { id: 'x', jour_semaine: 1, heure_debut: '10:00:00', heure_fin: '11:00:00' },
        ]),
        cours('c2', 'Lecture', [
          { id: 'y', jour_semaine: 1, heure_debut: '11:00:00', heure_fin: '12:00:00' },
        ]),
      ],
      plage
    )

    expect(blocs.some((bloc) => bloc.enConflit)).toBe(false)
    expect(blocs.every((bloc) => bloc.nbVoies === 1)).toBe(true)
  })

  it('donne une couleur stable par cours, partagée par ses créneaux', () => {
    const blocs = construireBlocs(
      [
        cours('c1', 'Hifz', [
          { id: 'x', jour_semaine: 1, heure_debut: '10:00:00', heure_fin: '11:00:00' },
          { id: 'y', jour_semaine: 3, heure_debut: '15:00:00', heure_fin: '16:00:00' },
        ]),
      ],
      plage
    )

    expect(blocs[0]?.couleur).toBe(blocs[1]?.couleur)
  })

  it('renvoie une liste vide sans cours', () => {
    expect(construireBlocs([], plage)).toEqual([])
  })
})

describe('joursEnConflit', () => {
  it('liste les jours portant au moins un conflit', () => {
    const blocs = construireBlocs(
      [
        cours('c1', 'A', [
          { id: 'x', jour_semaine: 4, heure_debut: '10:00:00', heure_fin: '11:30:00' },
        ]),
        cours('c2', 'B', [
          { id: 'y', jour_semaine: 4, heure_debut: '11:00:00', heure_fin: '12:00:00' },
        ]),
        cours('c3', 'C', [
          { id: 'z', jour_semaine: 6, heure_debut: '09:00:00', heure_fin: '10:00:00' },
        ]),
      ],
      { debutMinutes: 8 * 60, finMinutes: 13 * 60 }
    )

    expect([...joursEnConflit(blocs)]).toEqual([4])
  })
})
