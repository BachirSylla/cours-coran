import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'

import { SectionMembres } from '@/features/membres/components/SectionMembres'
import { useCreerInvitation } from '@/features/membres/hooks/useCreerInvitation'
import { useInvitations } from '@/features/membres/hooks/useInvitations'
import { useMembre } from '@/features/membres/hooks/useMembre'
import { useMembres } from '@/features/membres/hooks/useMembres'
import { useRevoquerInvitation } from '@/features/membres/hooks/useRevoquerInvitation'
import type { Invitation } from '@/shared/supabase/invitationRepo'
import type { Membre } from '@/shared/supabase/membreRepo'

vi.mock('@/features/membres/hooks/useMembre', () => ({ useMembre: vi.fn() }))
vi.mock('@/features/membres/hooks/useMembres', () => ({ useMembres: vi.fn() }))
vi.mock('@/features/membres/hooks/useInvitations', () => ({ useInvitations: vi.fn() }))
vi.mock('@/features/membres/hooks/useCreerInvitation', () => ({ useCreerInvitation: vi.fn() }))
vi.mock('@/features/membres/hooks/useRevoquerInvitation', () => ({
  useRevoquerInvitation: vi.fn(),
}))

const useMembreMock = vi.mocked(useMembre)
const useMembresMock = vi.mocked(useMembres)
const useInvitationsMock = vi.mocked(useInvitations)
const useCreerMock = vi.mocked(useCreerInvitation)
const useRevoquerMock = vi.mocked(useRevoquerInvitation)

const creerMutate = vi.fn()
const revoquerMutate = vi.fn()

const CODE = 'BP3Q-DNS5-WEQZ'
const DEMAIN = new Date(Date.now() + 86_400_000).toISOString()
const HIER = new Date(Date.now() - 86_400_000).toISOString()

function membre(user_id: string, nom_affiche: string, role: string): Membre {
  return {
    id: `membre-${user_id}`,
    centre_id: 'centre-1',
    user_id,
    role,
    nom_affiche,
    note_bareme: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function invitation(id: string, extra: Partial<Invitation> = {}): Invitation {
  return {
    id,
    centre_id: 'centre-1',
    role: 'enseignant',
    cree_par: 'moi',
    expire_le: DEMAIN,
    utilise_le: null,
    utilise_par: null,
    revoquee_le: null,
    created_at: '2026-08-01T10:00:00Z',
    updated_at: '2026-08-01T10:00:00Z',
    ...extra,
  }
}

function simulerInvitations(data: Invitation[]) {
  useInvitationsMock.mockReturnValue({ data } as UseQueryResult<Invitation[], Error>)
}

function mutation<T>(supplement: Record<string, unknown> = {}): T {
  return {
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    ...supplement,
  } as T
}

describe('SectionMembres', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useMembreMock.mockReturnValue({
      membre: null,
      userId: 'moi',
      centreId: 'centre-1',
      role: 'responsable',
      estResponsable: true,
      chargement: false,
    })
    useMembresMock.mockReturnValue({
      data: [membre('moi', 'Bachir', 'responsable'), membre('u2', 'Amina', 'enseignant')],
      isPending: false,
      isError: false,
      error: null,
    } as UseQueryResult<Membre[], Error>)
    simulerInvitations([])
    useCreerMock.mockReturnValue(
      mutation<ReturnType<typeof useCreerInvitation>>({ mutate: creerMutate })
    )
    useRevoquerMock.mockReturnValue(
      mutation<ReturnType<typeof useRevoquerInvitation>>({ mutate: revoquerMutate })
    )
  })

  it('liste les membres avec leur rôle, et se signale soi-même', () => {
    render(<SectionMembres />)

    expect(screen.getByText(/Bachir/)).toBeInTheDocument()
    expect(screen.getByText('(vous)')).toBeInTheDocument()
    expect(screen.getByText('Amina')).toBeInTheDocument()
    expect(screen.getByText('Responsable')).toBeInTheDocument()
    expect(screen.getByText('Enseignant')).toBeInTheDocument()
  })

  it('ne montre aucun code tant qu’aucune invitation n’a été générée', () => {
    render(<SectionMembres />)

    expect(screen.queryByLabelText("Code d'invitation")).not.toBeInTheDocument()
  })

  it('affiche le code une fois généré, et permet de le copier', async () => {
    // Le code n'existe que dans cette réponse : la base n'en garde qu'une
    // empreinte, et aucune requête ne pourra le relire.
    creerMutate.mockImplementation((_jours, options?: { onSuccess?: (c: string) => void }) => {
      options?.onSuccess?.(CODE)
    })
    const utilisateur = userEvent.setup()

    render(<SectionMembres />)
    await utilisateur.click(screen.getByRole('button', { name: /Inviter un enseignant/ }))

    expect(screen.getByLabelText("Code d'invitation")).toHaveValue(CODE)

    await utilisateur.click(screen.getByRole('button', { name: 'Copier le code' }))

    await expect(navigator.clipboard.readText()).resolves.toBe(CODE)
    expect(screen.getByRole('button', { name: 'Code copié' })).toBeInTheDocument()
  })

  it('remonte l’erreur d’une génération refusée', () => {
    useCreerMock.mockReturnValue(
      mutation<ReturnType<typeof useCreerInvitation>>({
        mutate: creerMutate,
        isError: true,
        error: new Error('Seul le responsable du centre peut inviter un enseignant.'),
      })
    )

    render(<SectionMembres />)

    expect(
      screen.getByText('Seul le responsable du centre peut inviter un enseignant.')
    ).toBeInTheDocument()
  })

  it('ne liste que les invitations encore actives', () => {
    // Utilisée, révoquée et expirée sont du passé : les montrer donnerait des
    // boutons « révoquer » sans effet.
    simulerInvitations([
      invitation('i1'),
      invitation('i2', { utilise_le: '2026-08-02T10:00:00Z' }),
      invitation('i3', { revoquee_le: '2026-08-02T10:00:00Z' }),
      invitation('i4', { expire_le: HIER }),
    ])

    render(<SectionMembres />)

    expect(screen.getAllByRole('button', { name: /Révoquer l'invitation/ })).toHaveLength(1)
  })

  it('révoque une invitation en attente', async () => {
    simulerInvitations([invitation('i1')])
    const utilisateur = userEvent.setup()

    render(<SectionMembres />)
    await utilisateur.click(screen.getByRole('button', { name: /Révoquer l'invitation/ }))

    expect(revoquerMutate).toHaveBeenCalledExactlyOnceWith('i1')
  })

  it('dit que le code ne s’affichera plus', async () => {
    creerMutate.mockImplementation((_jours, options?: { onSuccess?: (c: string) => void }) => {
      options?.onSuccess?.(CODE)
    })
    const utilisateur = userEvent.setup()

    render(<SectionMembres />)
    await utilisateur.click(screen.getByRole('button', { name: /Inviter un enseignant/ }))

    expect(screen.getByText(/Il ne s'affichera plus/)).toBeInTheDocument()
  })
})
