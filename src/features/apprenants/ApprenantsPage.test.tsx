import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'

import { ApprenantsPage } from '@/features/apprenants/ApprenantsPage'
import { useApprenants } from '@/features/apprenants/hooks/useApprenants'
import { useCreerApprenant } from '@/features/apprenants/hooks/useCreerApprenant'
import { useModifierApprenant } from '@/features/apprenants/hooks/useModifierApprenant'
import { useSupprimerApprenant } from '@/features/apprenants/hooks/useSupprimerApprenant'
import { useMembre } from '@/features/membres/hooks/useMembre'
import type { Apprenant } from '@/shared/supabase/apprenantRepo'
import { rendreAvecQuery } from '@/test/rendreAvecQuery'

// Aucun réseau : seuls le rendu et les états de la page sont testés.
vi.mock('@/features/apprenants/hooks/useApprenants', () => ({ useApprenants: vi.fn() }))
vi.mock('@/features/apprenants/hooks/useCreerApprenant', () => ({ useCreerApprenant: vi.fn() }))
vi.mock('@/features/apprenants/hooks/useModifierApprenant', () => ({
  useModifierApprenant: vi.fn(),
}))
vi.mock('@/features/apprenants/hooks/useSupprimerApprenant', () => ({
  useSupprimerApprenant: vi.fn(),
}))
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

const useApprenantsMock = vi.mocked(useApprenants)
const useCreerMock = vi.mocked(useCreerApprenant)
const useModifierMock = vi.mocked(useModifierApprenant)
const useSupprimerMock = vi.mocked(useSupprimerApprenant)

function apprenant(id: string, prenom: string, nom: string, extra?: Partial<Apprenant>) {
  return {
    id,
    centre_id: 'centre-1',
    nom,
    prenom,
    contact: null,
    niveau: null,
    notes: null,
    date_inscription: '2026-02-01',
    statut: 'actif',
    created_at: '2026-02-01T10:00:00Z',
    updated_at: '2026-02-01T10:00:00Z',
    ...extra,
  } satisfies Apprenant
}

/** Mutation neutre par défaut : ni en cours, ni en erreur. */
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

function simulerListe(etat: Partial<UseQueryResult<Apprenant[], Error>>) {
  useApprenantsMock.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    ...etat,
  } as UseQueryResult<Apprenant[], Error>)
}

describe('ApprenantsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useMembreMock.mockReturnValue(membre())
    useCreerMock.mockReturnValue(mutationInerte<ReturnType<typeof useCreerApprenant>>())
    useModifierMock.mockReturnValue(mutationInerte<ReturnType<typeof useModifierApprenant>>())
    useSupprimerMock.mockReturnValue(mutationInerte<ReturnType<typeof useSupprimerApprenant>>())
  })

  it('affiche un indicateur pendant le chargement', () => {
    simulerListe({ isPending: true })

    rendreAvecQuery(<ApprenantsPage />)

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/chargement des apprenants/i)).toBeInTheDocument()
  })

  it('affiche l’erreur quand le chargement échoue', () => {
    simulerListe({ isError: true, error: new Error('Accès refusé.') })

    rendreAvecQuery(<ApprenantsPage />)

    expect(screen.getByText('Chargement impossible')).toBeInTheDocument()
    expect(screen.getByText('Accès refusé.')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('affiche un état vide invitant à créer une fiche', () => {
    simulerListe({ data: [] })

    rendreAvecQuery(<ApprenantsPage />)

    expect(screen.getByText('Aucun apprenant pour le moment')).toBeInTheDocument()
    // Le bouton d'en-tête + celui de l'encart vide.
    expect(screen.getAllByRole('button', { name: /nouvel apprenant/i })).toHaveLength(2)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('affiche la liste des apprenants avec leurs actions', () => {
    simulerListe({
      data: [
        apprenant('1', 'Aïcha', 'Diallo', { contact: '+224 600', niveau: 'Qaïda' }),
        apprenant('2', 'Moussa', 'Camara', { statut: 'pause' }),
      ],
    })

    rendreAvecQuery(<ApprenantsPage />)

    // Chaque apprenant apparaît deux fois : tableau (≥ md) et carte (mobile).
    expect(screen.getAllByText('Aïcha Diallo')).toHaveLength(2)
    expect(screen.getAllByText('Moussa Camara')).toHaveLength(2)
    expect(screen.getAllByText('En pause')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Modifier Aïcha Diallo' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Supprimer Moussa Camara' })).toHaveLength(2)

    expect(screen.queryByText('Aucun apprenant pour le moment')).not.toBeInTheDocument()
  })

  it('remonte l’erreur d’une suppression échouée', () => {
    simulerListe({ data: [apprenant('1', 'Aïcha', 'Diallo')] })
    useSupprimerMock.mockReturnValue(
      mutationInerte<ReturnType<typeof useSupprimerApprenant>>({
        isError: true,
        error: new Error('Suppression refusée.'),
      })
    )

    rendreAvecQuery(<ApprenantsPage />)

    expect(screen.getByText('Suppression impossible')).toBeInTheDocument()
    expect(screen.getByText('Suppression refusée.')).toBeInTheDocument()
  })

  describe('recherche et pagination', () => {
    /** Douze apprenants, nommés « Apprenant 01 » à « Apprenant 12 ». */
    const douze = Array.from({ length: 12 }, (_, index) => {
      const numero = String(index + 1).padStart(2, '0')
      return apprenant(`a${numero}`, 'Apprenant', numero)
    })

    beforeEach(() => {
      try {
        window.localStorage.clear()
      } catch {
        // Stockage indisponible : le défaut s'applique de toute façon.
      }
    })

    it('ignore accents et majuscules, et cherche dans le numéro sans espaces', async () => {
      simulerListe({
        data: [
          apprenant('1', 'Pauléle', 'Fall', { contact: '+221 78 631 37 70' }),
          apprenant('2', 'Awa', 'Diagne'),
        ],
      })
      rendreAvecQuery(<ApprenantsPage />)

      const champ = screen.getByRole('searchbox', { name: 'Rechercher un apprenant' })

      await userEvent.type(champ, 'PAULELE')
      expect(screen.getAllByText('Pauléle Fall')).toHaveLength(2)
      expect(screen.queryByText('Awa Diagne')).not.toBeInTheDocument()

      await userEvent.clear(champ)
      await userEvent.type(champ, '78631')
      expect(screen.getAllByText('Pauléle Fall')).toHaveLength(2)
      expect(screen.getByText('1 apprenant')).toBeInTheDocument()
    })

    /*
     * Une recherche vide de résultats doit se dire, et offrir la sortie : sinon
     * la page se lit comme une liste perdue.
     */
    it('dit qu’aucun apprenant ne correspond, et permet d’effacer', async () => {
      simulerListe({ data: [apprenant('1', 'Awa', 'Diagne')] })
      rendreAvecQuery(<ApprenantsPage />)

      await userEvent.type(screen.getByRole('searchbox'), 'zzz')
      expect(screen.getByText('Aucun apprenant ne correspond à « zzz ».')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }))
      expect(screen.getAllByText('Awa Diagne')).toHaveLength(2)
    })

    it('affiche dix lignes par page, et le reste sur la suivante', async () => {
      simulerListe({ data: douze })
      rendreAvecQuery(<ApprenantsPage />)

      expect(screen.getByText('1–10 sur 12 apprenants')).toBeInTheDocument()
      expect(screen.getAllByText('Apprenant 10')).toHaveLength(2)
      expect(screen.queryByText('Apprenant 11')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Page précédente' })).toBeDisabled()

      await userEvent.click(screen.getByRole('button', { name: 'Page suivante' }))

      expect(screen.getByText('11–12 sur 12 apprenants')).toBeInTheDocument()
      expect(screen.getAllByText('Apprenant 12')).toHaveLength(2)
      expect(screen.queryByText('Apprenant 01')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute(
        'aria-current',
        'page'
      )
    })

    /*
     * ⚠️ Sans ce retour, chercher depuis la page 3 gardait la page : sur un
     * résultat de deux pages, on atterrissait en page 2, au milieu des
     * réponses, sans voir les premières. (Un résultat d'UNE page ne le montre
     * pas : `paginer` ramène alors la page à 1 de lui-même — le premier jet de
     * ce test restait vert, garde retirée.)
     */
    it('revient à la première page quand la recherche change', async () => {
      const vingtCinq = Array.from({ length: 25 }, (_, index) => {
        const numero = String(index + 1).padStart(2, '0')
        return apprenant(`a${numero}`, 'Apprenant', numero, {
          niveau: index < 20 ? 'Débutant' : 'Avancé',
        })
      })
      simulerListe({ data: vingtCinq })
      rendreAvecQuery(<ApprenantsPage />)

      await userEvent.click(screen.getByRole('button', { name: 'Page 3' }))
      expect(screen.getByText('21–25 sur 25 apprenants')).toBeInTheDocument()

      await userEvent.type(screen.getByRole('searchbox'), 'debutant')

      expect(screen.getByText('1–10 sur 20 apprenants')).toBeInTheDocument()
      expect(screen.getAllByText('Apprenant 01')).toHaveLength(2)
    })

    it('change le nombre de lignes par page, et s’en souvient', async () => {
      simulerListe({ data: douze })
      const { unmount } = rendreAvecQuery(<ApprenantsPage />)

      await userEvent.selectOptions(
        screen.getByRole('combobox', { name: 'Lignes par page' }),
        '25'
      )
      expect(screen.getByText('12 apprenants')).toBeInTheDocument()
      expect(screen.getAllByText('Apprenant 12')).toHaveLength(2)

      unmount()
      rendreAvecQuery(<ApprenantsPage />)
      expect(screen.getByText('12 apprenants')).toBeInTheDocument()
    })

    it('place le curseur dans la recherche avec « / »', () => {
      simulerListe({ data: [apprenant('1', 'Awa', 'Diagne')] })
      rendreAvecQuery(<ApprenantsPage />)

      fireEvent.keyDown(document.body, { key: '/' })

      expect(screen.getByRole('searchbox')).toHaveFocus()
    })

    it('efface la recherche avec Échap', async () => {
      simulerListe({ data: [apprenant('1', 'Awa', 'Diagne')] })
      rendreAvecQuery(<ApprenantsPage />)

      const champ = screen.getByRole('searchbox')
      await userEvent.type(champ, 'awa{Escape}')

      expect(champ).toHaveValue('')
    })
  })

  describe('selon le rôle', () => {
    it('laisse le responsable créer et tenir les fiches', () => {
      simulerListe({ data: [apprenant('a1', 'Aïcha', 'Diallo')] })

      rendreAvecQuery(<ApprenantsPage />)

      expect(screen.getByRole('button', { name: /Nouvel apprenant/ })).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /Modifier Aïcha Diallo/ })).not.toHaveLength(
        0
      )
    })

    it('donne à l’enseignant la liste, et rien qu’elle', () => {
      // Il voit l'identité des apprenants inscrits à SES cours (la RLS s'en
      // charge), mais tenir la fiche relève de la gestion (migration 0012).
      useMembreMock.mockReturnValue(membre('enseignant'))
      simulerListe({ data: [apprenant('a1', 'Aïcha', 'Diallo')] })

      rendreAvecQuery(<ApprenantsPage />)

      expect(screen.getAllByText(/Diallo/)).not.toHaveLength(0)
      expect(screen.queryByRole('button', { name: /Nouvel apprenant/ })).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /Modifier Aïcha Diallo/ })
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /Supprimer Aïcha Diallo/ })
      ).not.toBeInTheDocument()
    })

    it('n’invite pas un enseignant à créer une fiche quand la liste est vide', () => {
      useMembreMock.mockReturnValue(membre('enseignant'))
      simulerListe({ data: [] })

      rendreAvecQuery(<ApprenantsPage />)

      expect(screen.getByText(/Aucun apprenant n’est inscrit à vos cours/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Nouvel apprenant/ })).not.toBeInTheDocument()
    })
  })
})
