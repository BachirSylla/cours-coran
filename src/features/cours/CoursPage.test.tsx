import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'

import { CoursPage } from '@/features/cours/CoursPage'
import { useCours } from '@/features/cours/hooks/useCours'
import { useCreerCours } from '@/features/cours/hooks/useCreerCours'
import { useModifierCours } from '@/features/cours/hooks/useModifierCours'
import { useSupprimerCours } from '@/features/cours/hooks/useSupprimerCours'
import { useTousLesCreneaux } from '@/features/cours/hooks/useTousLesCreneaux'
import { useTypesCours } from '@/features/cours/hooks/useTypesCours'
import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'
import { rendreAvecQuery } from '@/test/rendreAvecQuery'

vi.mock('@/features/cours/hooks/useCours', () => ({ useCours: vi.fn() }))
vi.mock('@/features/cours/hooks/useCreerCours', () => ({ useCreerCours: vi.fn() }))
vi.mock('@/features/cours/hooks/useModifierCours', () => ({ useModifierCours: vi.fn() }))
vi.mock('@/features/cours/hooks/useSupprimerCours', () => ({ useSupprimerCours: vi.fn() }))
vi.mock('@/features/cours/hooks/useTousLesCreneaux', () => ({ useTousLesCreneaux: vi.fn() }))
vi.mock('@/features/cours/hooks/useTypesCours', () => ({ useTypesCours: vi.fn() }))

const useCoursMock = vi.mocked(useCours)
const useCreerMock = vi.mocked(useCreerCours)
const useModifierMock = vi.mocked(useModifierCours)
const useSupprimerMock = vi.mocked(useSupprimerCours)
const useCreneauxMock = vi.mocked(useTousLesCreneaux)
const useTypesMock = vi.mocked(useTypesCours)

function mutationInerte<T>(supplement: Record<string, unknown> = {}): T {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    ...supplement,
  } as unknown as T
}

function requeteVide<T>(donnees: T) {
  return { data: donnees, isPending: false, isError: false, error: null } as UseQueryResult<
    T,
    Error
  >
}

function cours(
  id: string,
  libelle: string,
  creneaux: { jour_semaine: number; heure_debut: string; heure_fin: string }[],
  extra?: Partial<CoursAvecDetails>
): CoursAvecDetails {
  return {
    id,
    owner_id: 'proprietaire',
    libelle,
    type_cours_id: 'type-1',
    format: 'groupe',
    date_debut: '2026-07-27',
    date_fin: null,
    lien_meet: null,
    prix_mensuel: null,
    devise: 'XOF',
    statut: 'actif',
    created_at: '2026-07-27T10:00:00Z',
    updated_at: '2026-07-27T10:00:00Z',
    type_cours: { libelle: 'Mémorisation' },
    inscription: [{ count: 0 }],
    creneau: creneaux.map((creneau, index) => ({
      id: `${id}-cr${index}`,
      owner_id: 'proprietaire',
      cours_id: id,
      created_at: '2026-07-27T10:00:00Z',
      updated_at: '2026-07-27T10:00:00Z',
      ...creneau,
    })),
    ...extra,
  }
}

function simulerListe(etat: Partial<UseQueryResult<CoursAvecDetails[], Error>>) {
  useCoursMock.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    ...etat,
  } as UseQueryResult<CoursAvecDetails[], Error>)
}

describe('CoursPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useCreerMock.mockReturnValue(mutationInerte<ReturnType<typeof useCreerCours>>())
    useModifierMock.mockReturnValue(mutationInerte<ReturnType<typeof useModifierCours>>())
    useSupprimerMock.mockReturnValue(mutationInerte<ReturnType<typeof useSupprimerCours>>())
    useCreneauxMock.mockReturnValue(requeteVide([]))
    useTypesMock.mockReturnValue(requeteVide([]))
  })

  it('affiche un indicateur pendant le chargement', () => {
    simulerListe({ isPending: true })

    rendreAvecQuery(<CoursPage />)

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/chargement des cours/i)).toBeInTheDocument()
  })

  it('affiche l’erreur quand le chargement échoue', () => {
    simulerListe({ isError: true, error: new Error('Session expirée.') })

    rendreAvecQuery(<CoursPage />)

    expect(screen.getByText('Chargement impossible')).toBeInTheDocument()
    expect(screen.getByText('Session expirée.')).toBeInTheDocument()
  })

  it('affiche un état vide invitant à créer un cours', () => {
    simulerListe({ data: [] })

    rendreAvecQuery(<CoursPage />)

    expect(screen.getByText('Aucun cours pour le moment')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /nouveau cours/i })).toHaveLength(2)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('affiche les cours avec le résumé de leurs créneaux', () => {
    simulerListe({
      data: [
        cours('1', 'Groupe Hifz', [
          { jour_semaine: 1, heure_debut: '10:00:00', heure_fin: '11:00:00' },
          { jour_semaine: 3, heure_debut: '15:00:00', heure_fin: '16:00:00' },
        ]),
        cours('2', 'Lecture Aïcha', [
          { jour_semaine: 2, heure_debut: '09:00:00', heure_fin: '10:00:00' },
        ]),
      ],
    })

    rendreAvecQuery(<CoursPage />)

    // Chaque cours apparaît deux fois : tableau (≥ md) et carte (mobile).
    expect(screen.getAllByText('Groupe Hifz')).toHaveLength(2)
    expect(screen.getAllByText('Lun 10:00–11:00 · Mer 15:00–16:00')).toHaveLength(2)
    expect(screen.getAllByText('Mar 09:00–10:00')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Modifier Groupe Hifz' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Supprimer Lecture Aïcha' })).toHaveLength(2)
  })

  it('remonte l’erreur d’une suppression échouée', () => {
    simulerListe({ data: [cours('1', 'Groupe Hifz', [])] })
    useSupprimerMock.mockReturnValue(
      mutationInerte<ReturnType<typeof useSupprimerCours>>({
        isError: true,
        error: new Error('Suppression refusée.'),
      })
    )

    rendreAvecQuery(<CoursPage />)

    expect(screen.getByText('Suppression impossible')).toBeInTheDocument()
    expect(screen.getByText('Suppression refusée.')).toBeInTheDocument()
  })
})
