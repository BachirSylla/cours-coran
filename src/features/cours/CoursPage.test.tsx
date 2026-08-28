import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider, type UseQueryResult } from '@tanstack/react-query'

import { CoursPage } from '@/features/cours/CoursPage'
import { useCours } from '@/features/cours/hooks/useCours'
import { useCreerCours } from '@/features/cours/hooks/useCreerCours'
import { useModifierCours } from '@/features/cours/hooks/useModifierCours'
import { useSupprimerCours } from '@/features/cours/hooks/useSupprimerCours'
import { useTousLesCreneaux } from '@/features/cours/hooks/useTousLesCreneaux'
import { useTypesCours } from '@/features/cours/hooks/useTypesCours'
import { useMembre } from '@/features/membres/hooks/useMembre'
import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'
import { rendreAvecQuery } from '@/test/rendreAvecQuery'

/**
 * Le dialogue de détail est remplacé par un témoin : ce qui est vérifié plus bas
 * est **quel cours la page lui transmet**, pas ce qu'il en affiche.
 */
vi.mock('@/features/cours/components/CoursDetailDialog', () => ({
  CoursDetailDialog: ({ cours }: { cours: CoursAvecDetails | null }) =>
    cours ? <div data-testid="detail" data-jeton={cours.jeton_partage ?? ''} /> : null,
}))
vi.mock('@/features/cours/hooks/useCours', () => ({ useCours: vi.fn() }))
vi.mock('@/features/cours/hooks/useCreerCours', () => ({ useCreerCours: vi.fn() }))
vi.mock('@/features/cours/hooks/useModifierCours', () => ({ useModifierCours: vi.fn() }))
vi.mock('@/features/cours/hooks/useSupprimerCours', () => ({ useSupprimerCours: vi.fn() }))
vi.mock('@/features/cours/hooks/useTousLesCreneaux', () => ({ useTousLesCreneaux: vi.fn() }))
vi.mock('@/features/cours/hooks/useTypesCours', () => ({ useTypesCours: vi.fn() }))
vi.mock('@/features/membres/hooks/useMembre', () => ({ useMembre: vi.fn() }))

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

const useCoursMock = vi.mocked(useCours)
const useCreerMock = vi.mocked(useCreerCours)
const useModifierMock = vi.mocked(useModifierCours)
const useSupprimerMock = vi.mocked(useSupprimerCours)
const useCreneauxMock = vi.mocked(useTousLesCreneaux)
const useTypesMock = vi.mocked(useTypesCours)

function mutationInerte<T>(supplement: Record<string, unknown> = {}): T {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    ...supplement,
  } as unknown as T
}

function requeteVide<T>(donnees: T) {
  return { data: donnees, isPending: false, isError: false, error: null } as UseQueryResult<
    T,
    Error
  >
}

function cours(
  id: string,
  libelle: string,
  creneaux: { jour_semaine: number; heure_debut: string; heure_fin: string }[],
  extra?: Partial<CoursAvecDetails>
): CoursAvecDetails {
  return {
    id,
    owner_id: 'proprietaire',
    centre_id: 'centre-1',
    libelle,
    type_cours_id: 'type-1',
    format: 'groupe',
    date_debut: '2026-07-27',
    date_fin: null,
    lien_meet: null,
    jeton_partage: null,
    enseignant_id: null,
    logo: null,
    assiduite_active: null,
    base_academique: null,
    bareme_assiduite: null,
    penalite_absence: null,
    penalite_retard: null,
    penaliser_absences_excusees: null,
    prix_mensuel: null,
    devise: 'XOF',
    statut: 'actif',
    created_at: '2026-07-27T10:00:00Z',
    updated_at: '2026-07-27T10:00:00Z',
    type_cours: { libelle: 'Mémorisation' },
    inscription: [{ count: 0 }],
    creneau: creneaux.map((creneau, index) => ({
      id: `${id}-cr${index}`,
      owner_id: 'proprietaire',
      centre_id: 'centre-1',
      cours_id: id,
      created_at: '2026-07-27T10:00:00Z',
      updated_at: '2026-07-27T10:00:00Z',
      ...creneau,
    })),
    ...extra,
  }
}

function simulerListe(etat: Partial<UseQueryResult<CoursAvecDetails[], Error>>) {
  useCoursMock.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    ...etat,
  } as UseQueryResult<CoursAvecDetails[], Error>)
}

describe('CoursPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useMembreMock.mockReturnValue(membre())
    useCreerMock.mockReturnValue(mutationInerte<ReturnType<typeof useCreerCours>>())
    useModifierMock.mockReturnValue(mutationInerte<ReturnType<typeof useModifierCours>>())
    useSupprimerMock.mockReturnValue(mutationInerte<ReturnType<typeof useSupprimerCours>>())
    useCreneauxMock.mockReturnValue(requeteVide([]))
    useTypesMock.mockReturnValue(requeteVide([]))
  })

  it('affiche un indicateur pendant le chargement', () => {
    simulerListe({ isPending: true })

    rendreAvecQuery(<CoursPage />)

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/chargement des cours/i)).toBeInTheDocument()
  })

  it('affiche l’erreur quand le chargement échoue', () => {
    simulerListe({ isError: true, error: new Error('Session expirée.') })

    rendreAvecQuery(<CoursPage />)

    expect(screen.getByText('Chargement impossible')).toBeInTheDocument()
    expect(screen.getByText('Session expirée.')).toBeInTheDocument()
  })

  it('affiche un état vide invitant à créer un cours', () => {
    simulerListe({ data: [] })

    rendreAvecQuery(<CoursPage />)

    expect(screen.getByText('Aucun cours pour le moment')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /nouveau cours/i })).toHaveLength(2)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('affiche les cours avec le résumé de leurs créneaux', () => {
    simulerListe({
      data: [
        cours('1', 'Groupe Hifz', [
          { jour_semaine: 1, heure_debut: '10:00:00', heure_fin: '11:00:00' },
          { jour_semaine: 3, heure_debut: '15:00:00', heure_fin: '16:00:00' },
        ]),
        cours('2', 'Lecture Aïcha', [
          { jour_semaine: 2, heure_debut: '09:00:00', heure_fin: '10:00:00' },
        ]),
      ],
    })

    rendreAvecQuery(<CoursPage />)

    // Chaque cours apparaît deux fois : tableau (≥ md) et carte (mobile).
    expect(screen.getAllByText('Groupe Hifz')).toHaveLength(2)
    expect(screen.getAllByText('Lun 10:00–11:00 · Mer 15:00–16:00')).toHaveLength(2)
    expect(screen.getAllByText('Mar 09:00–10:00')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Modifier Groupe Hifz' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Supprimer Lecture Aïcha' })).toHaveLength(2)
  })

  it('reflète dans le détail ouvert une modification venue du serveur', async () => {
    // Régression : le détail figeait une copie du cours prise au clic. Activer
    // le partage depuis ce dialogue n'y faisait donc jamais apparaître le lien,
    // alors que le jeton existait bien en base.
    const utilisateur = userEvent.setup()
    simulerListe({ data: [cours('1', 'Groupe Hifz', [])] })

    // `rerender` remplace tout l'arbre : le provider doit en faire partie,
    // sinon la seconde passe perdrait le contexte de React Query.
    // L'élément est reconstruit à chaque passe : React court-circuite le rendu
    // d'un élément qui lui revient identique par référence.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    const page = () => (
      <QueryClientProvider client={client}>
        <CoursPage />
      </QueryClientProvider>
    )

    const { rerender } = render(page())
    await utilisateur.click(
      screen.getAllByRole('button', { name: 'Groupe Hifz' })[0] as HTMLElement
    )

    expect(screen.getByTestId('detail')).toHaveAttribute('data-jeton', '')

    simulerListe({ data: [cours('1', 'Groupe Hifz', [], { jeton_partage: 'jeton-frais' })] })
    rerender(page())

    expect(screen.getByTestId('detail')).toHaveAttribute('data-jeton', 'jeton-frais')
  })

  describe('selon le rôle', () => {
    it('ouvre la création et les actions de gestion au responsable', () => {
      simulerListe({ data: [cours('1', 'Groupe Hifz', [])] })

      rendreAvecQuery(<CoursPage />)

      expect(screen.getAllByRole('button', { name: /Nouveau cours/ })).not.toHaveLength(0)
      expect(screen.getAllByRole('button', { name: /Modifier Groupe Hifz/ })).not.toHaveLength(
        0
      )
    })

    it('les retire à un enseignant, qui garde la lecture', () => {
      // La RLS les refuserait de toute façon (migration 0012) : lui tendre les
      // boutons ne ferait que promettre une action impossible.
      useMembreMock.mockReturnValue(membre('enseignant'))
      simulerListe({ data: [cours('1', 'Groupe Hifz', [])] })

      rendreAvecQuery(<CoursPage />)

      expect(screen.queryByRole('button', { name: /Nouveau cours/ })).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /Modifier Groupe Hifz/ })
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /Supprimer Groupe Hifz/ })
      ).not.toBeInTheDocument()
      // Son cours reste visible : il l'enseigne.
      expect(screen.getAllByText('Groupe Hifz')).not.toHaveLength(0)
    })

    it('n’invite pas un enseignant sans cours à en créer un', () => {
      useMembreMock.mockReturnValue(membre('enseignant'))
      simulerListe({ data: [] })

      rendreAvecQuery(<CoursPage />)

      expect(screen.getByText(/Aucun cours ne vous est affecté/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Nouveau cours/ })).not.toBeInTheDocument()
    })
  })

  it('remonte l’erreur d’une suppression échouée', () => {
    simulerListe({ data: [cours('1', 'Groupe Hifz', [])] })
    useSupprimerMock.mockReturnValue(
      mutationInerte<ReturnType<typeof useSupprimerCours>>({
        isError: true,
        error: new Error('Suppression refusée.'),
      })
    )

    rendreAvecQuery(<CoursPage />)

    expect(screen.getByText('Suppression impossible')).toBeInTheDocument()
    expect(screen.getByText('Suppression refusée.')).toBeInTheDocument()
  })
})
