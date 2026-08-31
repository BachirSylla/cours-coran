import { screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'

import { useCours } from '@/features/cours/hooks/useCours'
import { useModifierCours } from '@/features/cours/hooks/useModifierCours'
import { useTousLesCreneaux } from '@/features/cours/hooks/useTousLesCreneaux'
import { useTypesCours } from '@/features/cours/hooks/useTypesCours'
import { useMembre } from '@/features/membres/hooks/useMembre'
import { useMembres } from '@/features/membres/hooks/useMembres'
import { PlanningPage } from '@/features/planning/PlanningPage'
import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'
import { rendreAvecQuery } from '@/test/rendreAvecQuery'

vi.mock('@/features/cours/hooks/useCours', () => ({ useCours: vi.fn() }))
vi.mock('@/features/cours/hooks/useModifierCours', () => ({ useModifierCours: vi.fn() }))
vi.mock('@/features/cours/hooks/useTousLesCreneaux', () => ({ useTousLesCreneaux: vi.fn() }))
vi.mock('@/features/cours/hooks/useTypesCours', () => ({ useTypesCours: vi.fn() }))
vi.mock('@/features/membres/hooks/useMembre', () => ({ useMembre: vi.fn() }))
vi.mock('@/features/membres/hooks/useMembres', () => ({ useMembres: vi.fn() }))

const useMembreMock = vi.mocked(useMembre)
const useMembresMock = vi.mocked(useMembres)

/**
 * Rôle du compte dans son centre. Par défaut responsable — c'est la situation
 * de l'enseignant solo, qui est aussi responsable de son propre centre : ces
 * tests décrivent alors exactement le comportement d'avant la migration 0012.
 */
function membre(role: 'responsable' | 'enseignant' = 'responsable') {
  return {
    membre: null,
    userId: 'moi',
    centreId: 'centre-1',
    role,
    estResponsable: role === 'responsable',
    chargement: false,
  }
}

const useCoursMock = vi.mocked(useCours)
const useModifierMock = vi.mocked(useModifierCours)
const useCreneauxMock = vi.mocked(useTousLesCreneaux)
const useTypesMock = vi.mocked(useTypesCours)

function requete<T>(donnees: T) {
  return { data: donnees, isPending: false, isError: false, error: null } as UseQueryResult<
    T,
    Error
  >
}

function cours(
  id: string,
  libelle: string,
  creneaux: { id: string; jour_semaine: number; heure_debut: string; heure_fin: string }[]
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
  }
}

function afficher() {
  return rendreAvecQuery(
    <MemoryRouter>
      <PlanningPage />
    </MemoryRouter>
  )
}

function simulerCours(etat: Partial<UseQueryResult<CoursAvecDetails[], Error>>) {
  useCoursMock.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    ...etat,
  } as UseQueryResult<CoursAvecDetails[], Error>)
}

describe('PlanningPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useMembreMock.mockReturnValue(membre())
    useMembresMock.mockReturnValue({ data: [] } as unknown as ReturnType<typeof useMembres>)
    useModifierMock.mockReturnValue({
      mutateAsync: vi.fn(),
      reset: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useModifierCours>)
    useCreneauxMock.mockReturnValue(requete([]))
    useTypesMock.mockReturnValue(requete([]))
  })

  it('affiche un indicateur pendant le chargement', () => {
    simulerCours({ isPending: true })

    afficher()

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/chargement du planning/i)).toBeInTheDocument()
  })

  it('affiche l’erreur quand le chargement échoue', () => {
    simulerCours({ isError: true, error: new Error('Session expirée.') })

    afficher()

    expect(screen.getByText('Chargement impossible')).toBeInTheDocument()
    expect(screen.getByText('Session expirée.')).toBeInTheDocument()
  })

  it('affiche un état vide invitant à créer un cours', () => {
    simulerCours({ data: [] })

    afficher()

    expect(screen.getByText('Votre semaine est vide')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /créer un cours/i })).toHaveAttribute(
      'href',
      '/cours'
    )
  })

  it('place un bloc par créneau, avec son libellé et sa plage', () => {
    simulerCours({
      data: [
        cours('c1', 'Groupe Hifz', [
          { id: 'x', jour_semaine: 1, heure_debut: '10:00:00', heure_fin: '11:00:00' },
        ]),
      ],
    })

    afficher()

    // Rendu deux fois : grille mobile (un jour) et grille desktop (semaine).
    const blocs = screen.getAllByRole('button', { name: /Groupe Hifz, 10:00 à 11:00/ })
    expect(blocs.length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Groupe Hifz').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('Votre semaine est vide')).not.toBeInTheDocument()
  })

  it('signale les chevauchements sans aucune action de l’utilisateur', () => {
    simulerCours({
      data: [
        cours('c1', 'Groupe Hifz', [
          { id: 'x', jour_semaine: 2, heure_debut: '10:00:00', heure_fin: '11:30:00' },
        ]),
        cours('c2', 'Lecture Aïcha', [
          { id: 'y', jour_semaine: 2, heure_debut: '11:00:00', heure_fin: '12:00:00' },
        ]),
      ],
    })

    afficher()

    expect(screen.getByText('2 créneaux en conflit')).toBeInTheDocument()
    // Chaque bloc fautif l'annonce dans son libellé accessible.
    expect(
      screen.getAllByRole('button', { name: /Groupe Hifz.*en conflit avec un autre cours/ })
        .length
    ).toBeGreaterThanOrEqual(1)
    expect(
      screen.getAllByRole('button', { name: /Lecture Aïcha.*en conflit avec un autre cours/ })
        .length
    ).toBeGreaterThanOrEqual(1)
  })

  it('n’affiche aucune alerte quand les créneaux sont seulement adjacents', () => {
    simulerCours({
      data: [
        cours('c1', 'Groupe Hifz', [
          { id: 'x', jour_semaine: 3, heure_debut: '10:00:00', heure_fin: '11:00:00' },
        ]),
        cours('c2', 'Lecture Aïcha', [
          { id: 'y', jour_semaine: 3, heure_debut: '11:00:00', heure_fin: '12:00:00' },
        ]),
      ],
    })

    afficher()

    expect(screen.queryByText(/créneaux? en conflit/)).not.toBeInTheDocument()
  })

  it('propose un sélecteur de jour pour la vue mobile', () => {
    simulerCours({
      data: [
        cours('c1', 'Groupe Hifz', [
          { id: 'x', jour_semaine: 1, heure_debut: '10:00:00', heure_fin: '11:00:00' },
        ]),
      ],
    })

    afficher()

    expect(screen.getByRole('tablist', { name: /jour de la semaine/i })).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(7)
  })
})
