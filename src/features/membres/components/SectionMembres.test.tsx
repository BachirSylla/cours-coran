import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'

import { SectionMembres } from '@/features/membres/components/SectionMembres'
import { useCours, useCoursToutesSessions } from '@/features/cours/hooks/useCours'
import { useCreerInvitation } from '@/features/membres/hooks/useCreerInvitation'
import { useInvitations } from '@/features/membres/hooks/useInvitations'
import { useMembre } from '@/features/membres/hooks/useMembre'
import { useMembres } from '@/features/membres/hooks/useMembres'
import { useRetirerMembre } from '@/features/membres/hooks/useRetirerMembre'
import { useRevoquerInvitation } from '@/features/membres/hooks/useRevoquerInvitation'
import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'
import type { Invitation } from '@/shared/supabase/invitationRepo'
import type { Membre } from '@/shared/supabase/membreRepo'

vi.mock('@/features/membres/hooks/useMembre', () => ({ useMembre: vi.fn() }))
vi.mock('@/features/membres/hooks/useMembres', () => ({ useMembres: vi.fn() }))
vi.mock('@/features/membres/hooks/useInvitations', () => ({ useInvitations: vi.fn() }))
vi.mock('@/features/membres/hooks/useCreerInvitation', () => ({ useCreerInvitation: vi.fn() }))
vi.mock('@/features/membres/hooks/useRevoquerInvitation', () => ({
  useRevoquerInvitation: vi.fn(),
}))
vi.mock('@/features/membres/hooks/useRetirerMembre', () => ({ useRetirerMembre: vi.fn() }))
vi.mock('@/features/cours/hooks/useCours', () => ({
  useCoursToutesSessions: vi.fn(),
  // Volontairement mocké alors que le composant ne doit PAS l'employer : un
  // test plus bas vérifie qu'il reste muet.
  useCours: vi.fn(),
}))

const useMembreMock = vi.mocked(useMembre)
const useMembresMock = vi.mocked(useMembres)
const useInvitationsMock = vi.mocked(useInvitations)
const useCreerMock = vi.mocked(useCreerInvitation)
const useRevoquerMock = vi.mocked(useRevoquerInvitation)
const useRetirerMock = vi.mocked(useRetirerMembre)
const useCoursMock = vi.mocked(useCoursToutesSessions)
/** Celui filtré par session : le composant ne doit jamais l'appeler. */
const useCoursSessionMock = vi.mocked(useCours)

const creerMutate = vi.fn()
const revoquerMutate = vi.fn()
const retirerMutate = vi.fn()

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

/** Cours du centre — le responsable les voit tous, d''où la liste complète. */
function cours(
  id: string,
  libelle: string,
  enseignant_id: string | null,
  session_id = 'session-1'
): CoursAvecDetails {
  return {
    id,
    centre_id: 'centre-1',
    enseignant_id,
    session_id,
    libelle,
    type_cours_id: 'type-1',
    format: 'groupe',
    date_debut: '2026-07-01',
    date_fin: null,
    lien_meet: null,
    jeton_partage: null,
    niveau: null,
    reconduit_de: null,
    logo: null,
    assiduite_active: null,
    base_academique: null,
    bareme_assiduite: null,
    penalite_absence: null,
    penalite_retard: null,
    penaliser_absences_excusees: null,
    statut: 'actif',
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
    type_cours: { libelle: 'Mémorisation' },
    inscription: [{ count: 0 }],
    creneau: [],
    tarif: [],
  }
}

function simulerMembres(data: Membre[]) {
  useMembresMock.mockReturnValue({
    data,
    isPending: false,
    isError: false,
    error: null,
  } as UseQueryResult<Membre[], Error>)
}

function simulerCours(data: CoursAvecDetails[]) {
  useCoursMock.mockReturnValue({ data } as UseQueryResult<CoursAvecDetails[], Error>)
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
    simulerMembres([
      membre('moi', 'Bachir', 'responsable'),
      membre('u2', 'Amina', 'enseignant'),
    ])
    simulerInvitations([])
    useCreerMock.mockReturnValue(
      mutation<ReturnType<typeof useCreerInvitation>>({ mutate: creerMutate })
    )
    useRevoquerMock.mockReturnValue(
      mutation<ReturnType<typeof useRevoquerInvitation>>({ mutate: revoquerMutate })
    )
    useRetirerMock.mockReturnValue(
      mutation<ReturnType<typeof useRetirerMembre>>({ mutate: retirerMutate })
    )
    simulerCours([])
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

describe('SectionMembres — retrait d’un membre', () => {
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
    simulerInvitations([])
    useCreerMock.mockReturnValue(
      mutation<ReturnType<typeof useCreerInvitation>>({ mutate: creerMutate })
    )
    useRevoquerMock.mockReturnValue(
      mutation<ReturnType<typeof useRevoquerInvitation>>({ mutate: revoquerMutate })
    )
    useRetirerMock.mockReturnValue(
      mutation<ReturnType<typeof useRetirerMembre>>({ mutate: retirerMutate })
    )
    simulerMembres([
      membre('moi', 'Bachir', 'responsable'),
      membre('u2', 'Amina', 'enseignant'),
    ])
    simulerCours([])
  })

  it('ne propose pas de se retirer soi-même', () => {
    render(<SectionMembres />)

    expect(screen.queryByRole('button', { name: /Retirer Bachir/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retirer Amina/ })).toBeInTheDocument()
  })

  it('ne propose pas de retirer le dernier responsable', () => {
    // La base le refuserait (trigger de 0012) : offrir le bouton ne ferait que
    // promettre un geste impossible.
    simulerMembres([
      membre('moi', 'Bachir', 'enseignant'),
      membre('u2', 'Amina', 'responsable'),
    ])

    render(<SectionMembres />)

    expect(screen.queryByRole('button', { name: /Retirer Amina/ })).not.toBeInTheDocument()
  })

  it('propose de retirer un responsable dès qu’il y en a deux', () => {
    simulerMembres([
      membre('moi', 'Bachir', 'responsable'),
      membre('u2', 'Amina', 'responsable'),
    ])

    render(<SectionMembres />)

    expect(screen.getByRole('button', { name: /Retirer Amina/ })).toBeInTheDocument()
  })

  it('dit ce que le retrait ne détruit pas', async () => {
    // C'est la question qu'on se pose à cet instant : « est-ce que je perds son
    // travail ? ». Non — tout pend du cours.
    const utilisateur = userEvent.setup()

    render(<SectionMembres />)
    await utilisateur.click(screen.getByRole('button', { name: /Retirer Amina/ }))

    expect(screen.getByText(/restent intactes/)).toBeInTheDocument()
    expect(screen.getByText(/Son compte est conservé/)).toBeInTheDocument()
  })

  it('ne montre aucun sélecteur quand le partant n’enseigne rien', async () => {
    const utilisateur = userEvent.setup()

    render(<SectionMembres />)
    await utilisateur.click(screen.getByRole('button', { name: /Retirer Amina/ }))

    expect(screen.queryByLabelText(/cours revient à/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/cours reviennent à/)).not.toBeInTheDocument()
  })

  /*
   * ⚠️ LE PIÈGE DE LA MIGRATION 0022, trouvé en relecture.
   *
   * `retirer_membre` réaffecte les cours du partant **toutes sessions
   * confondues**. Si cet écran comptait sur la session AFFICHÉE, le décompte
   * mentirait — et si tous ses cours étaient hors session active, le sélecteur
   * de repreneur disparaîtrait entièrement alors que la réaffectation aurait
   * quand même lieu : le responsable récupérerait des cours qu'il n'a jamais vus.
   */
  it('compte les cours du partant dans TOUTES les sessions', async () => {
    simulerCours([
      cours('c1', 'Niveau 1 — Session 17', 'u2', 'session-17'),
      cours('c2', 'Niveau 1 — Session 18', 'u2', 'session-18'),
    ])
    const utilisateur = userEvent.setup()

    render(<SectionMembres />)
    await utilisateur.click(screen.getByRole('button', { name: /Retirer Amina/ }))

    expect(screen.getByText('Ses 2 cours reviennent à')).toBeInTheDocument()
    expect(useCoursSessionMock).not.toHaveBeenCalled()
  })

  it('liste les cours du partant et les réaffecte au responsable par défaut', async () => {
    simulerCours([
      cours('c1', 'Groupe Hifz', 'u2'),
      cours('c2', 'Tajwid du soir', 'u2'),
      cours('c3', 'Lecture Aïcha', 'moi'),
    ])
    const utilisateur = userEvent.setup()

    render(<SectionMembres />)
    await utilisateur.click(screen.getByRole('button', { name: /Retirer Amina/ }))

    // Deux cours, pas trois : celui du responsable n'est pas concerné.
    expect(screen.getByLabelText('Ses 2 cours reviennent à')).toHaveValue('moi')
    expect(screen.getByText('Groupe Hifz, Tajwid du soir')).toBeInTheDocument()

    await utilisateur.click(screen.getByRole('button', { name: /^Retirer$/ }))

    expect(retirerMutate).toHaveBeenCalledExactlyOnceWith(
      { userId: 'u2', reaffecterA: 'moi' },
      expect.anything()
    )
  })

  it('permet de laisser les cours sans enseignant', async () => {
    // `null` est un CHOIX, pas un oubli : `cours_animables()` rend les cours
    // orphelins au responsable, donc rien ne se gèle (migration 0017).
    simulerCours([cours('c1', 'Groupe Hifz', 'u2')])
    const utilisateur = userEvent.setup()

    render(<SectionMembres />)
    await utilisateur.click(screen.getByRole('button', { name: /Retirer Amina/ }))
    await utilisateur.selectOptions(
      screen.getByLabelText('Son cours revient à'),
      'Laisser sans enseignant'
    )
    await utilisateur.click(screen.getByRole('button', { name: /^Retirer$/ }))

    expect(retirerMutate).toHaveBeenCalledExactlyOnceWith(
      { userId: 'u2', reaffecterA: null },
      expect.anything()
    )
  })

  it('ne propose pas le partant comme repreneur de ses propres cours', async () => {
    simulerCours([cours('c1', 'Groupe Hifz', 'u2')])
    const utilisateur = userEvent.setup()

    render(<SectionMembres />)
    await utilisateur.click(screen.getByRole('button', { name: /Retirer Amina/ }))

    const options = [...screen.getByLabelText('Son cours revient à').querySelectorAll('option')]
    expect(options.map((option) => option.value)).toEqual(['moi', ''])
  })

  it('remonte le refus du serveur', () => {
    // Le message vient de la RPC : le reformuler ici le ferait diverger.
    useRetirerMock.mockReturnValue(
      mutation<ReturnType<typeof useRetirerMembre>>({
        mutate: retirerMutate,
        isError: true,
        error: new Error('Un centre doit garder au moins un responsable.'),
      })
    )

    render(<SectionMembres />)

    expect(
      screen.getByText('Un centre doit garder au moins un responsable.')
    ).toBeInTheDocument()
  })
})
