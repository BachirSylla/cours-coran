import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'

import { useEnregistrerBareme } from '@/features/parametres/hooks/useEnregistrerBareme'
import { useParametres } from '@/features/parametres/hooks/useParametres'
import { ParametresPage } from '@/features/parametres/ParametresPage'
import type { ParametresEffectifs } from '@/shared/supabase/parametresRepo'

vi.mock('@/features/parametres/hooks/useParametres', () => ({ useParametres: vi.fn() }))
vi.mock('@/features/parametres/hooks/useEnregistrerBareme', () => ({
  useEnregistrerBareme: vi.fn(),
}))

const useParametresMock = vi.mocked(useParametres)
const useEnregistrerMock = vi.mocked(useEnregistrerBareme)
const mutate = vi.fn()

function simuler(etat: Partial<UseQueryResult<ParametresEffectifs, Error>>) {
  useParametresMock.mockReturnValue({
    data: { note_bareme: 20, enregistres: false },
    isPending: false,
    isError: false,
    error: null,
    ...etat,
  } as UseQueryResult<ParametresEffectifs, Error>)
}

describe('ParametresPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useEnregistrerMock.mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useEnregistrerBareme>)
  })

  it('affiche un indicateur pendant le chargement', () => {
    simuler({ isPending: true })

    render(<ParametresPage />)

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('affiche l’erreur en cas d’échec', () => {
    simuler({ isError: true, error: new Error('Session expirée.') })

    render(<ParametresPage />)

    expect(screen.getByText('Session expirée.')).toBeInTheDocument()
  })

  it('signale que 20 est la valeur par défaut tant que rien n’a été choisi', () => {
    simuler({ data: { note_bareme: 20, enregistres: false } })

    render(<ParametresPage />)

    expect(screen.getByText(/valeur par défaut \(20\)/)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /sur 20/i })).toBeChecked()
  })

  it('n’affiche plus la mention par défaut une fois le barème enregistré', () => {
    simuler({ data: { note_bareme: 10, enregistres: true } })

    render(<ParametresPage />)

    expect(screen.queryByText(/valeur par défaut/)).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /sur 10/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /sur 20/i })).not.toBeChecked()
  })

  it('enregistre le barème choisi', async () => {
    simuler({ data: { note_bareme: 20, enregistres: true } })
    const utilisateur = userEvent.setup()

    render(<ParametresPage />)
    await utilisateur.click(screen.getByRole('radio', { name: /sur 10/i }))

    expect(mutate).toHaveBeenCalledWith(10)
  })

  it('rassure sur le sort des notes déjà enregistrées', () => {
    simuler({ data: { note_bareme: 20, enregistres: true } })

    render(<ParametresPage />)

    expect(
      screen.getByText(/gardent le barème sous lequel elles ont été données/)
    ).toBeInTheDocument()
  })
})
