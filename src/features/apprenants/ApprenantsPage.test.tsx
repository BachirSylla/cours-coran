import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'

import { ApprenantsPage } from '@/features/apprenants/ApprenantsPage'
import { useApprenants } from '@/features/apprenants/hooks/useApprenants'
import { useCreerApprenant } from '@/features/apprenants/hooks/useCreerApprenant'
import { useModifierApprenant } from '@/features/apprenants/hooks/useModifierApprenant'
import { useSupprimerApprenant } from '@/features/apprenants/hooks/useSupprimerApprenant'
import type { Apprenant } from '@/shared/supabase/apprenantRepo'
import { rendreAvecQuery } from '@/test/rendreAvecQuery'

// Aucun réseau : seuls le rendu et les états de la page sont testés.
vi.mock('@/features/apprenants/hooks/useApprenants', () => ({ useApprenants: vi.fn() }))
vi.mock('@/features/apprenants/hooks/useCreerApprenant', () => ({ useCreerApprenant: vi.fn() }))
vi.mock('@/features/apprenants/hooks/useModifierApprenant', () => ({
  useModifierApprenant: vi.fn(),
}))
vi.mock('@/features/apprenants/hooks/useSupprimerApprenant', () => ({
  useSupprimerApprenant: vi.fn(),
}))

const useApprenantsMock = vi.mocked(useApprenants)
const useCreerMock = vi.mocked(useCreerApprenant)
const useModifierMock = vi.mocked(useModifierApprenant)
const useSupprimerMock = vi.mocked(useSupprimerApprenant)

function apprenant(id: string, prenom: string, nom: string, extra?: Partial<Apprenant>) {
  return {
    id,
    owner_id: 'proprietaire',
    nom,
    prenom,
    contact: null,
    niveau: null,
    notes: null,
    date_inscription: '2026-02-01',
    statut: 'actif',
    created_at: '2026-02-01T10:00:00Z',
    updated_at: '2026-02-01T10:00:00Z',
    ...extra,
  } satisfies Apprenant
}

/** Mutation neutre par défaut : ni en cours, ni en erreur. */
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

function simulerListe(etat: Partial<UseQueryResult<Apprenant[], Error>>) {
  useApprenantsMock.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    ...etat,
  } as UseQueryResult<Apprenant[], Error>)
}

describe('ApprenantsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useCreerMock.mockReturnValue(mutationInerte<ReturnType<typeof useCreerApprenant>>())
    useModifierMock.mockReturnValue(mutationInerte<ReturnType<typeof useModifierApprenant>>())
    useSupprimerMock.mockReturnValue(mutationInerte<ReturnType<typeof useSupprimerApprenant>>())
  })

  it('affiche un indicateur pendant le chargement', () => {
    simulerListe({ isPending: true })

    rendreAvecQuery(<ApprenantsPage />)

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/chargement des apprenants/i)).toBeInTheDocument()
  })

  it('affiche l’erreur quand le chargement échoue', () => {
    simulerListe({ isError: true, error: new Error('Accès refusé.') })

    rendreAvecQuery(<ApprenantsPage />)

    expect(screen.getByText('Chargement impossible')).toBeInTheDocument()
    expect(screen.getByText('Accès refusé.')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('affiche un état vide invitant à créer une fiche', () => {
    simulerListe({ data: [] })

    rendreAvecQuery(<ApprenantsPage />)

    expect(screen.getByText('Aucun apprenant pour le moment')).toBeInTheDocument()
    // Le bouton d'en-tête + celui de l'encart vide.
    expect(screen.getAllByRole('button', { name: /nouvel apprenant/i })).toHaveLength(2)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('affiche la liste des apprenants avec leurs actions', () => {
    simulerListe({
      data: [
        apprenant('1', 'Aïcha', 'Diallo', { contact: '+224 600', niveau: 'Qaïda' }),
        apprenant('2', 'Moussa', 'Camara', { statut: 'pause' }),
      ],
    })

    rendreAvecQuery(<ApprenantsPage />)

    // Chaque apprenant apparaît deux fois : tableau (≥ md) et carte (mobile).
    expect(screen.getAllByText('Aïcha Diallo')).toHaveLength(2)
    expect(screen.getAllByText('Moussa Camara')).toHaveLength(2)
    expect(screen.getAllByText('En pause')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Modifier Aïcha Diallo' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Supprimer Moussa Camara' })).toHaveLength(2)

    expect(screen.queryByText('Aucun apprenant pour le moment')).not.toBeInTheDocument()
  })

  it('remonte l’erreur d’une suppression échouée', () => {
    simulerListe({ data: [apprenant('1', 'Aïcha', 'Diallo')] })
    useSupprimerMock.mockReturnValue(
      mutationInerte<ReturnType<typeof useSupprimerApprenant>>({
        isError: true,
        error: new Error('Suppression refusée.'),
      })
    )

    rendreAvecQuery(<ApprenantsPage />)

    expect(screen.getByText('Suppression impossible')).toBeInTheDocument()
    expect(screen.getByText('Suppression refusée.')).toBeInTheDocument()
  })
})
