import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SelecteurSession } from '@/features/sessions/components/SelecteurSession'
import { useSessionActive } from '@/features/sessions/hooks/useSessions'
import type { Session } from '@/shared/supabase/sessionRepo'

vi.mock('@/features/sessions/hooks/useSessions', () => ({ useSessionActive: vi.fn() }))

const useSessionActiveMock = vi.mocked(useSessionActive)
const choisir = vi.fn()

function session(id: string, nom: string, statut = 'en_cours'): Session {
  return {
    id,
    centre_id: 'centre-1',
    nom,
    date_debut: '2026-01-05',
    date_fin: null,
    statut,
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
  }
}

const S17 = session('s17', 'Session 17')
const S18 = session('s18', 'Session 18')

function simuler(sessions: Session[], active = sessions[0] ?? null, chargement = false) {
  useSessionActiveMock.mockReturnValue({
    session: active,
    sessionId: active?.id,
    sessions,
    chargement,
    erreur: null,
    choisir,
    plusieurs: sessions.length > 1,
  })
}

describe('SelecteurSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /*
   * ⚠️ L'exigence principale de la migration 0022 : un centre qui n'utilise pas
   * les sessions ne doit rien voir de neuf. Le backfill lui en a posé une, mais
   * une liste déroulante à un seul choix donnerait l'impression d'un réglage à
   * faire — là où il n'y a rien à décider.
   */
  it('affiche un simple libellé quand il n’y a qu’une session', () => {
    simuler([S17])
    render(<SelecteurSession />)

    expect(screen.getByText('Session 17')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('propose une liste dès qu’il y a plusieurs sessions', () => {
    simuler([S18, S17], S18)
    render(<SelecteurSession />)

    const liste = screen.getByRole('combobox', { name: 'Session affichée' })
    expect(liste).toHaveValue('s18')
    expect(screen.getByRole('option', { name: 'Session 17' })).toBeInTheDocument()
  })

  it('bascule sur la session choisie', async () => {
    const utilisateur = userEvent.setup()
    simuler([S18, S17], S18)
    render(<SelecteurSession />)

    await utilisateur.selectOptions(
      screen.getByRole('combobox', { name: 'Session affichée' }),
      's17'
    )

    expect(choisir).toHaveBeenCalledWith('s17')
  })

  /*
   * Une session clôturée reste sélectionnable : on consulte, on imprime un
   * rapport, on relit une progression. C'est la saisie qui se ferme.
   */
  it('laisse choisir une session terminée, en le disant', () => {
    simuler([S18, session('s16', 'Session 16', 'terminee')], S18)
    render(<SelecteurSession />)

    expect(screen.getByRole('option', { name: 'Session 16 (terminée)' })).toBeInTheDocument()
  })

  it('ne montre rien tant que les sessions ne sont pas chargées', () => {
    simuler([], null, true)
    const { container } = render(<SelecteurSession />)

    expect(container).toBeEmptyDOMElement()
  })

  it('ne montre rien si le centre n’a aucune session', () => {
    simuler([], null)
    const { container } = render(<SelecteurSession />)

    expect(container).toBeEmptyDOMElement()
  })
})
