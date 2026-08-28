import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuth } from '@/features/auth/useAuth'
import { useRacheterInvitation } from '@/features/membres/hooks/useRacheterInvitation'
import { RejoindreCentrePage } from '@/features/membres/RejoindreCentrePage'

vi.mock('@/features/auth/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('@/features/membres/hooks/useRacheterInvitation', () => ({
  useRacheterInvitation: vi.fn(),
}))

const useAuthMock = vi.mocked(useAuth)
const useRacheterMock = vi.mocked(useRacheterInvitation)
const mutateAsync = vi.fn()
const signOut = vi.fn()

function simulerRachat(supplement: Record<string, unknown> = {}) {
  useRacheterMock.mockReturnValue({
    mutateAsync,
    isPending: false,
    isError: false,
    error: null,
    ...supplement,
  } as unknown as ReturnType<typeof useRacheterInvitation>)
}

async function remplir(code: string, nom: string) {
  const utilisateur = userEvent.setup()

  render(<RejoindreCentrePage />)
  await utilisateur.type(screen.getByLabelText("Code d'invitation"), code)
  await utilisateur.type(screen.getByLabelText('Votre nom'), nom)
  await utilisateur.click(screen.getByRole('button', { name: 'Rejoindre' }))

  return utilisateur
}

describe('RejoindreCentrePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mutateAsync.mockResolvedValue('Centre Al-Fourqane')
    useAuthMock.mockReturnValue({
      user: { email: 'nouveau@example.com' },
      signOut,
    } as unknown as ReturnType<typeof useAuth>)
    simulerRachat()
  })

  it('échange le code et annonce le centre rejoint', async () => {
    await remplir('BP3Q-DNS5-WEQZ', '  Amina Diallo  ')

    // Le nom est transmis tel quel : c'est le serveur qui le nettoie, et le
    // dupliquer ici, c'est se condamner à ce que les deux divergent.
    expect(mutateAsync).toHaveBeenCalledExactlyOnceWith({
      code: 'BP3Q-DNS5-WEQZ',
      nomAffiche: 'Amina Diallo',
    })
    expect(await screen.findByText(/Vous avez rejoint Centre Al-Fourqane/)).toBeInTheDocument()
  })

  it('refuse un code de la mauvaise longueur sans appeler le serveur', async () => {
    await remplir('ABC', 'Amina')

    expect(await screen.findByText(/12 caractères/)).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('exige un nom affiché', async () => {
    const utilisateur = userEvent.setup()

    render(<RejoindreCentrePage />)
    await utilisateur.type(screen.getByLabelText("Code d'invitation"), 'BP3Q-DNS5-WEQZ')
    await utilisateur.click(screen.getByRole('button', { name: 'Rejoindre' }))

    expect(await screen.findByText(/nom sous lequel vos collègues/)).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('remonte le refus du serveur mot pour mot', () => {
    // Les messages viennent de la base (« expiré », « déjà utilisé », « révoqué »)
    // : les reformuler ici les ferait diverger.
    simulerRachat({
      isError: true,
      error: new Error('Ce code a expiré. Demandez-en un nouveau.'),
    })

    render(<RejoindreCentrePage />)

    expect(screen.getByText('Ce code a expiré. Demandez-en un nouveau.')).toBeInTheDocument()
  })

  it('laisse repartir qui s’est trompé de compte', async () => {
    // Sans cette porte, un compte créé par erreur enferme sur un écran sans issue.
    const utilisateur = userEvent.setup()

    render(<RejoindreCentrePage />)

    expect(screen.getByText(/nouveau@example.com/)).toBeInTheDocument()
    await utilisateur.click(screen.getByRole('button', { name: /Se déconnecter/ }))

    expect(signOut).toHaveBeenCalledOnce()
  })
})
