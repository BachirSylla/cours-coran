import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'

import { useEnregistrerBareme } from '@/features/parametres/hooks/useEnregistrerBareme'
import { useParametres } from '@/features/parametres/hooks/useParametres'
import { ParametresPage } from '@/features/parametres/ParametresPage'
import { NOTATION_PAR_DEFAUT } from '@/shared/lib/rapport'
import type { ParametresEffectifs } from '@/shared/supabase/parametresRepo'
import { rendreAvecQuery } from '@/test/rendreAvecQuery'

vi.mock('@/features/parametres/hooks/useParametres', () => ({ useParametres: vi.fn() }))
vi.mock('@/features/parametres/hooks/useEnregistrerBareme', () => ({
  useEnregistrerBareme: vi.fn(),
}))

const useParametresMock = vi.mocked(useParametres)
const useEnregistrerMock = vi.mocked(useEnregistrerBareme)
const mutate = vi.fn()

/** Cet écran ne règle que le barème de récitation : le reste vient des défauts. */
function parametres(note_bareme: number, enregistres: boolean): ParametresEffectifs {
  return { note_bareme, enregistres, ...NOTATION_PAR_DEFAUT }
}

function simuler(etat: Partial<UseQueryResult<ParametresEffectifs, Error>>) {
  useParametresMock.mockReturnValue({
    data: parametres(20, false),
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

    rendreAvecQuery(<ParametresPage />)

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('affiche l’erreur en cas d’échec', () => {
    simuler({ isError: true, error: new Error('Session expirée.') })

    rendreAvecQuery(<ParametresPage />)

    expect(screen.getByText('Session expirée.')).toBeInTheDocument()
  })

  it('signale que 20 est la valeur par défaut tant que rien n’a été choisi', () => {
    simuler({ data: parametres(20, false) })

    rendreAvecQuery(<ParametresPage />)

    expect(screen.getByText(/valeur par défaut \(20\)/)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /sur 20/i })).toBeChecked()
  })

  it('n’affiche plus la mention par défaut une fois le barème enregistré', () => {
    simuler({ data: parametres(10, true) })

    rendreAvecQuery(<ParametresPage />)

    expect(screen.queryByText(/valeur par défaut/)).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /sur 10/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /sur 20/i })).not.toBeChecked()
  })

  it('enregistre le barème choisi', async () => {
    simuler({ data: parametres(20, true) })
    const utilisateur = userEvent.setup()

    rendreAvecQuery(<ParametresPage />)
    await utilisateur.click(screen.getByRole('radio', { name: /sur 10/i }))

    expect(mutate).toHaveBeenCalledWith(10)
  })

  it('rassure sur le sort des notes déjà enregistrées', () => {
    simuler({ data: parametres(20, true) })

    rendreAvecQuery(<ParametresPage />)

    expect(
      screen.getByText(/gardent le barème sous lequel elles ont été données/)
    ).toBeInTheDocument()
  })
})
