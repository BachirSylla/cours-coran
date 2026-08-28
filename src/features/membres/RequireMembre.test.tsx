import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useMembre } from '@/features/membres/hooks/useMembre'
import { RequireMembre } from '@/features/membres/RequireMembre'
import type { Membre } from '@/shared/supabase/membreRepo'

vi.mock('@/features/membres/hooks/useMembre', () => ({ useMembre: vi.fn() }))
vi.mock('@/features/membres/RejoindreCentrePage', () => ({
  RejoindreCentrePage: () => <p>Rejoindre un centre</p>,
}))

const useMembreMock = vi.mocked(useMembre)

function simuler(membre: Membre | null, chargement = false) {
  useMembreMock.mockReturnValue({
    membre,
    userId: 'moi',
    centreId: membre?.centre_id ?? null,
    role: 'enseignant',
    estResponsable: false,
    chargement,
  })
}

const MEMBRE: Membre = {
  id: 'm1',
  centre_id: 'centre-1',
  user_id: 'moi',
  role: 'enseignant',
  nom_affiche: 'Amina',
  note_bareme: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function afficher(cheminInitial = '/cours') {
  render(
    <MemoryRouter initialEntries={[cheminInitial]}>
      <Routes>
        <Route element={<RequireMembre />}>
          <Route path="/cours" element={<p>Contenu du centre</p>} />
          {/* Le vrai routeur place un `*` sous la garde : toute URL entre
              dedans, ce qui est justement ce qui permet de rendre l'écran de
              rachat sans rediriger. */}
          <Route path="*" element={<p>Ailleurs dans le centre</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('RequireMembre', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('laisse passer un membre — l’expérience d’aujourd’hui est inchangée', () => {
    simuler(MEMBRE)

    afficher()

    expect(screen.getByText('Contenu du centre')).toBeInTheDocument()
    expect(screen.queryByText('Rejoindre un centre')).not.toBeInTheDocument()
  })

  it('accueille un compte inerte au lieu de lui montrer une application vide', () => {
    // Sans `membre`, la RLS ne lui renvoie rien : il verrait des listes vides
    // partout, ce qui se lit comme une panne (migration 0016).
    simuler(null)

    afficher()

    expect(screen.getByText('Rejoindre un centre')).toBeInTheDocument()
    expect(screen.queryByText('Contenu du centre')).not.toBeInTheDocument()
  })

  it('attend de savoir avant de décider', () => {
    // Trancher pendant le chargement ferait clignoter l'écran de rachat sous
    // les yeux d'un membre parfaitement légitime.
    simuler(null, true)

    afficher()

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('Rejoindre un centre')).not.toBeInTheDocument()
    expect(screen.queryByText('Contenu du centre')).not.toBeInTheDocument()
  })

  it('préserve l’URL demandée plutôt que de rediriger', () => {
    // L'écran est rendu à la place de l'`Outlet` : aucune route publique de
    // plus, et l'adresse reste celle que l'utilisateur voulait atteindre.
    simuler(null)

    afficher('/paiements')

    expect(screen.getByText('Rejoindre un centre')).toBeInTheDocument()
  })
})
