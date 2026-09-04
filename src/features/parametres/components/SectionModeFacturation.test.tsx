import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SectionModeFacturation } from '@/features/parametres/components/SectionModeFacturation'
import { useEnregistrerModeFacturation } from '@/features/parametres/hooks/useEnregistrerModeFacturation'
import { useSessions } from '@/features/sessions/hooks/useSessions'
import { NOTATION_PAR_DEFAUT } from '@/shared/lib/rapport'
import type { ModeFacturation } from '@/shared/lib/facturation'
import type { ParametresEffectifs } from '@/shared/supabase/parametresRepo'
import type { Session } from '@/shared/supabase/sessionRepo'

vi.mock('@/features/parametres/hooks/useEnregistrerModeFacturation', () => ({
  useEnregistrerModeFacturation: vi.fn(),
}))
vi.mock('@/features/sessions/hooks/useSessions', () => ({ useSessions: vi.fn() }))

const useEnregistrerMock = vi.mocked(useEnregistrerModeFacturation)
const useSessionsMock = vi.mocked(useSessions)
const enregistrer = vi.fn()

function parametres(mode: ModeFacturation): ParametresEffectifs {
  return {
    note_bareme: 20,
    logo: null,
    mode_facturation: mode,
    enregistres: true,
    ...NOTATION_PAR_DEFAUT,
  }
}

function session(nom: string, dateFin: string | null, statut = 'en_cours'): Session {
  return {
    id: `s-${nom}`,
    centre_id: 'centre-1',
    nom,
    date_debut: '2026-01-05',
    date_fin: dateFin,
    statut,
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
  }
}

function rendre(mode: ModeFacturation = 'mensuel') {
  return render(<SectionModeFacturation parametres={parametres(mode)} />)
}

describe('SectionModeFacturation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useEnregistrerMock.mockReturnValue({
      mutate: enregistrer,
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useEnregistrerModeFacturation>)
    useSessionsMock.mockReturnValue({
      data: [session('Session 18', '2026-06-30')],
    } as unknown as ReturnType<typeof useSessions>)
  })

  it('affiche le mode en vigueur et ce qu’il implique', () => {
    rendre('mensuel')

    expect(screen.getByLabelText('Mode')).toHaveValue('mensuel')
    expect(screen.getByText(/un montant par mois/i)).toBeInTheDocument()
  })

  it('n’enregistre rien tant que rien n’a changé', () => {
    rendre('mensuel')

    expect(screen.getByRole('button', { name: /enregistrer le mode/i })).toBeDisabled()
  })

  it('transmet le mode choisi', async () => {
    const utilisateur = userEvent.setup()
    rendre('mensuel')

    await utilisateur.selectOptions(screen.getByLabelText('Mode'), 'par_session')
    await utilisateur.click(screen.getByRole('button', { name: /enregistrer le mode/i }))

    expect(enregistrer).toHaveBeenCalledExactlyOnceWith('par_session')
  })

  /*
   * ⚠️ La crainte que ce réglage inspire est exactement celle-là : « est-ce que
   * je vais perdre ce qui est déjà saisi ? ». Une crainte non levée fait
   * renoncer à essayer, alors que la réponse est non.
   */
  it('promet la conservation de l’historique dès que le mode change', async () => {
    const utilisateur = userEvent.setup()
    rendre('mensuel')

    expect(screen.queryByText(/sont conservés/i)).not.toBeInTheDocument()

    await utilisateur.selectOptions(screen.getByLabelText('Mode'), 'par_session')

    expect(screen.getByText(/Changer de mode ne détruit rien/i)).toBeInTheDocument()
    expect(screen.getByText(/restent\s+modifiables/i)).toBeInTheDocument()
  })

  /*
   * La base REFUSE un forfait sur une session sans date de fin (P0080). Le dire
   * au moment du choix, et non à la première saisie de règlement.
   */
  it('signale les sessions sans date de fin quand on passe au forfait', async () => {
    useSessionsMock.mockReturnValue({
      data: [session('Session en cours', null), session('Session 18', '2026-06-30')],
    } as unknown as ReturnType<typeof useSessions>)

    const utilisateur = userEvent.setup()
    rendre('mensuel')

    expect(screen.queryByText(/pas de date de fin/i)).not.toBeInTheDocument()

    await utilisateur.selectOptions(screen.getByLabelText('Mode'), 'par_session')

    expect(screen.getByText(/« Session en cours » n'a pas de date de fin/)).toBeInTheDocument()
  })

  it('ne signale rien quand toutes les sessions sont bornées', async () => {
    const utilisateur = userEvent.setup()
    rendre('mensuel')

    await utilisateur.selectOptions(screen.getByLabelText('Mode'), 'par_session')

    expect(screen.queryByText(/pas de date de fin/i)).not.toBeInTheDocument()
  })

  /*
   * Une session terminée sans date de fin n'appelle aucun avertissement : on n'y
   * enregistrera plus de règlement, et la signaler serait un bruit qu'on
   * apprendrait à ignorer — au point de manquer les vrais.
   */
  it('ignore les sessions terminées', async () => {
    useSessionsMock.mockReturnValue({
      data: [session('Vieille session', null, 'terminee')],
    } as unknown as ReturnType<typeof useSessions>)

    const utilisateur = userEvent.setup()
    rendre('mensuel')

    await utilisateur.selectOptions(screen.getByLabelText('Mode'), 'par_session')

    expect(screen.queryByText(/pas de date de fin/i)).not.toBeInTheDocument()
  })
})
