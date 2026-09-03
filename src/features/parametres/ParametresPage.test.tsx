import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'

import { useMembre } from '@/features/membres/hooks/useMembre'
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
vi.mock('@/features/membres/hooks/useMembre', () => ({ useMembre: vi.fn() }))
// La section « Membres » monte ses propres requêtes ; elle a son propre test.
vi.mock('@/features/sessions/components/SectionSessions', () => ({
  SectionSessions: () => <div>Sessions</div>,
}))
vi.mock('@/features/membres/components/SectionMembres', () => ({
  SectionMembres: () => <section>Enseignants du centre</section>,
}))

const useMembreMock = vi.mocked(useMembre)

/**
 * Rôle du compte dans son centre. Par défaut responsable — c'est la situation
 * de l'enseignant solo, qui est aussi responsable de son propre centre : ces
 * tests décrivent alors exactement le comportement d'avant la migration 0012.
 */
function membre(role: 'responsable' | 'enseignant' = 'responsable') {
  return {
    membre: null,
    userId: 'moi',
    centreId: 'centre-1',
    role,
    estResponsable: role === 'responsable',
    chargement: false,
  }
}

const useParametresMock = vi.mocked(useParametres)
const useEnregistrerMock = vi.mocked(useEnregistrerBareme)
const mutate = vi.fn()

/** Cet écran ne règle que le barème de récitation : le reste vient des défauts. */
function parametres(note_bareme: number, enregistres: boolean): ParametresEffectifs {
  return { note_bareme, logo: null, enregistres, ...NOTATION_PAR_DEFAUT }
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
    useMembreMock.mockReturnValue(membre())
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

  describe('selon le rôle', () => {
    it('laisse un enseignant choisir SON barème de récitation', () => {
      // C'est son outil de travail, pas une règle du centre : il vit sur sa
      // ligne `membre` (migration 0012).
      useMembreMock.mockReturnValue(membre('enseignant'))
      simuler({ data: parametres(20, true) })

      rendreAvecQuery(<ParametresPage />)

      expect(screen.getByRole('radio', { name: /sur 10/i })).toBeEnabled()
      expect(screen.getByRole('radio', { name: /sur 20/i })).toBeEnabled()
      expect(screen.getByText(/ne s'impose pas aux autres enseignants/)).toBeInTheDocument()
    })

    it('enregistre le barème choisi par un enseignant', async () => {
      // Le choix part sur SA ligne `membre` — la seule colonne qu'un client
      // puisse y écrire (migration 0012), éprouvé côté base par
      // `supabase/tests/rls_etancheite.sql`.
      useMembreMock.mockReturnValue(membre('enseignant'))
      simuler({ data: parametres(20, true) })
      const utilisateur = userEvent.setup()

      rendreAvecQuery(<ParametresPage />)
      await utilisateur.click(screen.getByRole('radio', { name: /sur 10/i }))

      expect(mutate).toHaveBeenCalledExactlyOnceWith(10)
    })

    it('mais lui ferme les règles de notation du centre', () => {
      useMembreMock.mockReturnValue(membre('enseignant'))
      simuler({ data: parametres(20, true) })

      rendreAvecQuery(<ParametresPage />)

      expect(screen.getByText('Consultation seule')).toBeInTheDocument()
      expect(screen.queryByText('Notation de fin de session')).not.toBeInTheDocument()
      expect(screen.queryByText('Logo du centre')).not.toBeInTheDocument()
    })
  })
})
