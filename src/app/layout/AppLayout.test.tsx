import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppLayout } from '@/app/layout/AppLayout'
import { useAuth } from '@/features/auth/useAuth'
import { useMembre } from '@/features/membres/hooks/useMembre'

/**
 * Cohérence de la navigation avec le rôle (migration 0012).
 *
 * Le masquage n'est **pas** le garde-fou — la RLS l'est, et elle renverrait de
 * toute façon zéro ligne. Ce qu'il évite est le lien mort : un onglet qui mène
 * à une page vide se lit comme une panne, pas comme une permission.
 */
vi.mock('@/features/auth/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('@/features/membres/hooks/useMembre', () => ({ useMembre: vi.fn() }))
vi.mock('@/shared/ui/PwaInstallPrompt', () => ({ PwaInstallPrompt: () => null }))

const useAuthMock = vi.mocked(useAuth)
const useMembreMock = vi.mocked(useMembre)

function membre(role: 'responsable' | 'enseignant', chargement = false) {
  return {
    membre: null,
    userId: 'moi',
    centreId: 'centre-1',
    role,
    estResponsable: role === 'responsable',
    chargement,
  }
}

function afficher() {
  render(
    <MemoryRouter>
      <AppLayout />
    </MemoryRouter>
  )
}

const onglet = (nom: string) => screen.queryByRole('link', { name: nom })

describe('AppLayout — navigation selon le rôle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthMock.mockReturnValue({
      user: { email: 'moi@example.com' },
      signOut: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
  })

  it('donne au responsable la navigation complète', () => {
    // C'est aussi la situation de l'enseignant seul, responsable de son propre
    // centre : rien ne doit avoir bougé pour lui.
    useMembreMock.mockReturnValue(membre('responsable'))

    afficher()

    for (const nom of ['Planning', 'Cours', 'Séances', 'Apprenants', 'Paiements']) {
      expect(onglet(nom), nom).toBeInTheDocument()
    }
  })

  it('retire Paiements à un enseignant, et lui laisse le reste', () => {
    useMembreMock.mockReturnValue(membre('enseignant'))

    afficher()

    expect(onglet('Paiements')).not.toBeInTheDocument()
    for (const nom of ['Planning', 'Cours', 'Séances', 'Apprenants']) {
      expect(onglet(nom), nom).toBeInTheDocument()
    }
  })

  it('garde Paramètres ouvert à tous — l’enseignant y règle son barème', () => {
    useMembreMock.mockReturnValue(membre('enseignant'))

    afficher()

    expect(screen.getByRole('link', { name: 'Paramètres' })).toBeInTheDocument()
  })

  it('n’affiche pas l’onglet réservé tant que le rôle est inconnu', () => {
    // Mieux vaut le voir apparaître que le voir disparaître : un onglet qui
    // s'évanouit sous le curseur donne l'impression d'un bug.
    useMembreMock.mockReturnValue(membre('responsable', true))

    afficher()

    expect(onglet('Paiements')).not.toBeInTheDocument()
  })
})
