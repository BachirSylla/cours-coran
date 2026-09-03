import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'

import { useCoursToutesSessions } from '@/features/cours/hooks/useCours'
import { SectionSessions } from '@/features/sessions/components/SectionSessions'
import {
  useCreerSession,
  useModifierSession,
  useSessions,
} from '@/features/sessions/hooks/useSessions'
import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'
import type { Session } from '@/shared/supabase/sessionRepo'

vi.mock('@/features/sessions/hooks/useSessions', () => ({
  useSessions: vi.fn(),
  useCreerSession: vi.fn(),
  useModifierSession: vi.fn(),
}))
vi.mock('@/features/cours/hooks/useCours', () => ({ useCoursToutesSessions: vi.fn() }))

const useSessionsMock = vi.mocked(useSessions)
const useCreerMock = vi.mocked(useCreerSession)
const useModifierMock = vi.mocked(useModifierSession)
const useCoursMock = vi.mocked(useCoursToutesSessions)

const creer = vi.fn()
const modifier = vi.fn()

function session(id: string, nom: string, statut = 'en_cours', date_fin: string | null = null): Session {
  return {
    id,
    centre_id: 'centre-1',
    nom,
    date_debut: '2026-01-05',
    date_fin,
    statut,
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
  }
}

function cours(id: string, libelle: string, session_id: string, statut: string): CoursAvecDetails {
  return {
    id,
    centre_id: 'centre-1',
    enseignant_id: null,
    libelle,
    type_cours_id: 'type-1',
    session_id,
    niveau: null,
    reconduit_de: null,
    format: 'groupe',
    date_debut: '2026-01-05',
    date_fin: null,
    lien_meet: null,
    jeton_partage: null,
    logo: null,
    assiduite_active: null,
    base_academique: null,
    bareme_assiduite: null,
    penalite_absence: null,
    penalite_retard: null,
    penaliser_absences_excusees: null,
    statut,
    created_at: '2026-01-05T10:00:00Z',
    updated_at: '2026-01-05T10:00:00Z',
    type_cours: { libelle: 'Mémorisation' },
    inscription: [{ count: 0 }],
    creneau: [],
    tarif: [],
  }
}

const S17 = session('s17', 'Session 17')
const S16 = session('s16', 'Session 16', 'terminee')

function mutation(mutate: ReturnType<typeof vi.fn>, extra: Record<string, unknown> = {}) {
  return {
    mutate,
    isPending: false,
    isError: false,
    error: null,
    ...extra,
  } as unknown as ReturnType<typeof useCreerSession>
}

function requete<T>(donnees: T, etat: Record<string, unknown> = {}) {
  return {
    data: donnees,
    isPending: false,
    isError: false,
    error: null,
    ...etat,
  } as UseQueryResult<T, Error>
}

function ligne(nom: string): HTMLElement {
  const element = screen.getByText(nom).closest('li')
  if (!element) throw new Error(`Ligne introuvable pour ${nom}`)
  return element
}

describe('SectionSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSessionsMock.mockReturnValue(requete([S17, S16]))
    useCoursMock.mockReturnValue(requete<CoursAvecDetails[]>([]))
    useCreerMock.mockReturnValue(mutation(creer))
    useModifierMock.mockReturnValue(
      mutation(modifier) as unknown as ReturnType<typeof useModifierSession>
    )
  })

  it('liste les sessions et signale celles qui sont terminées', () => {
    render(<SectionSessions />)

    expect(screen.getByText('Session 17')).toBeInTheDocument()
    expect(within(ligne('Session 16')).getByText('Terminée')).toBeInTheDocument()
  })

  it('crée une session', async () => {
    const utilisateur = userEvent.setup()
    render(<SectionSessions />)

    await utilisateur.click(screen.getByRole('button', { name: /Nouvelle session/ }))
    await utilisateur.type(screen.getByLabelText('Nom'), 'Session 18')
    await utilisateur.type(screen.getByLabelText('Date de début'), '2026-06-01')
    await utilisateur.click(screen.getByRole('button', { name: 'Créer' }))

    expect(creer).toHaveBeenCalledWith(
      { nom: 'Session 18', date_debut: '2026-06-01' },
      expect.anything()
    )
  })

  /*
   * ⚠️ AVERTIR, JAMAIS BLOQUER. Un cours resté « actif » par oubli ne doit pas
   * empêcher de clore une période — mais le voir avant de confirmer évite de
   * s'en apercevoir un mois plus tard.
   */
  it('annonce les cours pas encore terminés, sans empêcher la clôture', async () => {
    const utilisateur = userEvent.setup()
    useCoursMock.mockReturnValue(
      requete([
        cours('c1', 'Coran niveau 1', 's17', 'actif'),
        cours('c2', 'Coran niveau 2', 's17', 'termine'),
        cours('c3', 'Tadjwîd', 's17', 'pause'),
        // D'une autre session : il ne doit pas apparaître.
        cours('c4', 'Ailleurs', 's16', 'actif'),
      ])
    )
    render(<SectionSessions />)

    await utilisateur.click(within(ligne('Session 17')).getByRole('button', { name: /Clôturer/ }))

    expect(screen.getByText(/2 cours ne sont pas encore marqués/)).toBeInTheDocument()
    expect(screen.getByText(/Coran niveau 1, Tadjwîd/)).toBeInTheDocument()
    expect(screen.queryByText(/Ailleurs/)).not.toBeInTheDocument()

    await utilisateur.click(screen.getByRole('button', { name: 'Clôturer' }))

    expect(modifier).toHaveBeenCalledWith({ id: 's17', session: { statut: 'terminee' } })
  })

  it('renonce à la clôture sur Annuler', async () => {
    const utilisateur = userEvent.setup()
    render(<SectionSessions />)

    await utilisateur.click(within(ligne('Session 17')).getByRole('button', { name: /Clôturer/ }))
    await utilisateur.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(modifier).not.toHaveBeenCalled()
  })

  it('dit ce que la clôture ferme, et ce qu’elle laisse ouvert', async () => {
    const utilisateur = userEvent.setup()
    render(<SectionSessions />)

    await utilisateur.click(within(ligne('Session 17')).getByRole('button', { name: /Clôturer/ }))

    expect(screen.getByText(/Tout reste lisible/)).toBeInTheDocument()
    expect(screen.getByText(/rapport reste téléchargeable/)).toBeInTheDocument()
    expect(screen.getByText(/rouvrir d'un clic/)).toBeInTheDocument()
  })

  it('rouvre une session terminée sans confirmation', async () => {
    const utilisateur = userEvent.setup()
    render(<SectionSessions />)

    await utilisateur.click(within(ligne('Session 16')).getByRole('button', { name: /Rouvrir/ }))

    expect(modifier).toHaveBeenCalledWith({ id: 's16', session: { statut: 'en_cours' } })
  })

  /*
   * La date de fin est PRÉVISIONNELLE : elle se corrige tant que la session est
   * ouverte, et se fige avec la clôture — ce qui est fini n'a plus de prévision.
   */
  it('laisse corriger la date de fin d’une session ouverte', async () => {
    const utilisateur = userEvent.setup()
    render(<SectionSessions />)

    const champ = within(ligne('Session 17')).getByLabelText(/Date de fin prévisionnelle/)
    expect(champ).toBeEnabled()

    await utilisateur.type(champ, '2026-05-31')

    expect(modifier).toHaveBeenCalled()
  })

  it('fige la date de fin d’une session terminée', () => {
    render(<SectionSessions />)

    expect(within(ligne('Session 16')).getByLabelText(/Date de fin prévisionnelle/)).toBeDisabled()
  })

  it('rappelle que la date de fin n’interdit rien', () => {
    render(<SectionSessions />)

    expect(screen.getByText(/n'interdit rien et peut être dépassée/)).toBeInTheDocument()
  })

  it('remonte le refus de la base sans le maquiller', () => {
    useModifierMock.mockReturnValue(
      mutation(modifier, {
        isError: true,
        error: new Error('Modification de la session : accès refusé.'),
      }) as unknown as ReturnType<typeof useModifierSession>
    )
    render(<SectionSessions />)

    expect(screen.getByText(/accès refusé/)).toBeInTheDocument()
  })
})
