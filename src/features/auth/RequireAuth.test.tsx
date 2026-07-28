import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RequireAuth } from '@/features/auth/RequireAuth'
import { useAuth } from '@/features/auth/useAuth'
import type { AuthContextValue, StatutAuth } from '@/features/auth/authContext'

// Le réseau Supabase n'est pas testé ici : seule la logique de garde l'est.
vi.mock('@/features/auth/useAuth', () => ({ useAuth: vi.fn() }))

const useAuthMock = vi.mocked(useAuth)

function simulerStatut(statut: StatutAuth) {
  useAuthMock.mockReturnValue({
    statut,
    session: null,
    user: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
  } satisfies AuthContextValue)
}

function afficher(cheminInitial = '/planning') {
  return render(
    <MemoryRouter initialEntries={[cheminInitial]}>
      <Routes>
        <Route path="/login" element={<p>Écran de connexion</p>} />
        <Route element={<RequireAuth />}>
          <Route path="/planning" element={<p>Contenu protégé</p>} />
          {/* Comme dans le vrai routeur, le 404 est lui aussi derrière la garde. */}
          <Route path="*" element={<p>Page introuvable</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('RequireAuth', () => {
  beforeEach(() => {
    useAuthMock.mockReset()
  })

  it('affiche un écran de chargement tant que la session n’est pas résolue', () => {
    simulerStatut('chargement')

    afficher()

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Chargement…')).toBeInTheDocument()
    // Aucun flash : ni contenu protégé, ni redirection prématurée.
    expect(screen.queryByText('Contenu protégé')).not.toBeInTheDocument()
    expect(screen.queryByText('Écran de connexion')).not.toBeInTheDocument()
  })

  it('redirige vers /login quand l’enseignant est déconnecté', () => {
    simulerStatut('deconnecte')

    afficher()

    expect(screen.getByText('Écran de connexion')).toBeInTheDocument()
    expect(screen.queryByText('Contenu protégé')).not.toBeInTheDocument()
  })

  it('rend les routes protégées quand la session est ouverte', () => {
    simulerStatut('connecte')

    afficher()

    expect(screen.getByText('Contenu protégé')).toBeInTheDocument()
    expect(screen.queryByText('Écran de connexion')).not.toBeInTheDocument()
  })

  it('protège aussi les URL inconnues : 404 renvoyé vers /login si déconnecté', () => {
    simulerStatut('deconnecte')

    afficher('/route-inexistante')

    expect(screen.getByText('Écran de connexion')).toBeInTheDocument()
    expect(screen.queryByText('Page introuvable')).not.toBeInTheDocument()
  })

  it('affiche le 404 de l’application quand la session est ouverte', () => {
    simulerStatut('connecte')

    afficher('/route-inexistante')

    expect(screen.getByText('Page introuvable')).toBeInTheDocument()
  })
})
