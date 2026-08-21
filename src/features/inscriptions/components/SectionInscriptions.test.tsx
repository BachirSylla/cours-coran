import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'

import { useApprenants } from '@/features/apprenants/hooks/useApprenants'
import { SectionInscriptions } from '@/features/inscriptions/components/SectionInscriptions'
import { useAjouterInscription } from '@/features/inscriptions/hooks/useAjouterInscription'
import { useInscriptionsCours } from '@/features/inscriptions/hooks/useInscriptionsCours'
import { useRetirerInscription } from '@/features/inscriptions/hooks/useRetirerInscription'
import type { Apprenant } from '@/shared/supabase/apprenantRepo'
import type { InscriptionAvecApprenant } from '@/shared/supabase/inscriptionRepo'

vi.mock('@/features/apprenants/hooks/useApprenants', () => ({ useApprenants: vi.fn() }))
vi.mock('@/features/inscriptions/hooks/useInscriptionsCours', () => ({
  useInscriptionsCours: vi.fn(),
}))
vi.mock('@/features/inscriptions/hooks/useAjouterInscription', () => ({
  useAjouterInscription: vi.fn(),
}))
vi.mock('@/features/inscriptions/hooks/useRetirerInscription', () => ({
  useRetirerInscription: vi.fn(),
}))

const useInscriptionsMock = vi.mocked(useInscriptionsCours)
const useApprenantsMock = vi.mocked(useApprenants)
const useAjouterMock = vi.mocked(useAjouterInscription)
const useRetirerMock = vi.mocked(useRetirerInscription)

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

function apprenant(id: string, prenom: string, nom: string): Apprenant {
  return {
    id,
    owner_id: 'proprietaire',
    nom,
    prenom,
    contact: null,
    niveau: null,
    notes: null,
    date_inscription: '2026-07-27',
    statut: 'actif',
    created_at: '2026-07-27T10:00:00Z',
    updated_at: '2026-07-27T10:00:00Z',
  }
}

function inscription(
  id: string,
  personne: Apprenant,
  extra: Partial<InscriptionAvecApprenant> = {}
): InscriptionAvecApprenant {
  return {
    id,
    owner_id: 'proprietaire',
    apprenant_id: personne.id,
    cours_id: 'cours-1',
    note_examen: null,
    examen_bareme: null,
    created_at: '2026-07-27T10:00:00Z',
    updated_at: '2026-07-27T10:00:00Z',
    apprenant: personne,
    ...extra,
  }
}

function simulerInscriptions(etat: Partial<UseQueryResult<InscriptionAvecApprenant[], Error>>) {
  useInscriptionsMock.mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
    error: null,
    ...etat,
  } as UseQueryResult<InscriptionAvecApprenant[], Error>)
}

const AICHA = apprenant('a1', 'Aïcha', 'Diallo')
const MOUSSA = apprenant('a2', 'Moussa', 'Camara')

describe('SectionInscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useApprenantsMock.mockReturnValue({
      data: [AICHA, MOUSSA],
      isPending: false,
      isError: false,
      error: null,
    } as UseQueryResult<Apprenant[], Error>)
    useAjouterMock.mockReturnValue(mutationInerte<ReturnType<typeof useAjouterInscription>>())
    useRetirerMock.mockReturnValue(mutationInerte<ReturnType<typeof useRetirerInscription>>())
  })

  it('affiche un état vide quand personne n’est inscrit', () => {
    simulerInscriptions({ data: [] })

    render(<SectionInscriptions coursId="cours-1" format="groupe" />)

    expect(screen.getByText('Aucun apprenant inscrit à ce cours.')).toBeInTheDocument()
  })

  it('liste les inscrits avec leur nombre', () => {
    simulerInscriptions({ data: [inscription('i1', AICHA), inscription('i2', MOUSSA)] })

    render(<SectionInscriptions coursId="cours-1" format="groupe" />)

    expect(screen.getByText('Aïcha Diallo')).toBeInTheDocument()
    expect(screen.getByText('Moussa Camara')).toBeInTheDocument()
    expect(screen.getByText('(2)')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Retirer Aïcha Diallo du cours/ })
    ).toBeInTheDocument()
  })

  it('laisse inscrire librement dans un groupe déjà peuplé', () => {
    simulerInscriptions({ data: [inscription('i1', AICHA), inscription('i2', MOUSSA)] })

    render(<SectionInscriptions coursId="cours-1" format="groupe" />)

    expect(screen.getByRole('combobox', { name: /inscrire un apprenant/i })).toBeEnabled()
    expect(screen.queryByText(/un seul apprenant/)).not.toBeInTheDocument()
  })

  it('autorise le premier inscrit d’un cours individuel', () => {
    simulerInscriptions({ data: [] })

    render(<SectionInscriptions coursId="cours-1" format="individuel" />)

    expect(screen.getByRole('combobox', { name: /inscrire un apprenant/i })).toBeEnabled()
  })

  it('bloque le deuxième inscrit d’un cours individuel, en expliquant pourquoi', () => {
    simulerInscriptions({ data: [inscription('i1', AICHA)] })

    render(<SectionInscriptions coursId="cours-1" format="individuel" />)

    expect(screen.getByRole('combobox', { name: /inscrire un apprenant/i })).toBeDisabled()
    // Un bouton désactivé sans explication serait un cul-de-sac.
    expect(screen.getByText(/ne peut accueillir qu'un seul apprenant/)).toBeInTheDocument()
  })

  it('remonte l’erreur d’une inscription refusée par la base', () => {
    simulerInscriptions({ data: [] })
    useAjouterMock.mockReturnValue(
      mutationInerte<ReturnType<typeof useAjouterInscription>>({
        isError: true,
        error: new Error('Cet apprenant est déjà inscrit à ce cours.'),
      })
    )

    render(<SectionInscriptions coursId="cours-1" format="groupe" />)

    expect(screen.getByText('Cet apprenant est déjà inscrit à ce cours.')).toBeInTheDocument()
  })

  it('affiche un indicateur pendant le chargement', () => {
    simulerInscriptions({ isPending: true, data: undefined })

    render(<SectionInscriptions coursId="cours-1" format="groupe" />)

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  /**
   * La note d'examen vit sur l'inscription : la retirer la supprime. C'est une
   * perte irréversible, elle doit être annoncée avant, pas découverte après.
   */
  describe('retrait d’un apprenant', () => {
    async function ouvrirLaConfirmation() {
      const utilisateur = userEvent.setup()
      render(<SectionInscriptions coursId="cours-1" format="groupe" />)

      await utilisateur.click(
        screen.getByRole('button', { name: /Retirer Aïcha Diallo du cours/ })
      )
    }

    it('avertit que la note d’examen sera perdue, en la citant', async () => {
      simulerInscriptions({
        data: [inscription('i1', AICHA, { note_examen: 15.5, examen_bareme: 20 })],
      })

      await ouvrirLaConfirmation()

      expect(
        screen.getByText(/Sa note d'examen \(15,5\/20\) sera définitivement supprimée/)
      ).toBeInTheDocument()
    })

    it('se tait quand il n’y a aucune note à perdre', async () => {
      simulerInscriptions({ data: [inscription('i1', AICHA)] })

      await ouvrirLaConfirmation()

      // La confirmation existe bien, mais sans avertissement superflu.
      expect(screen.getByText(/ne suivra plus ce cours/)).toBeInTheDocument()
      expect(screen.queryByText(/note d'examen/)).not.toBeInTheDocument()
    })

    it('se tait aussi devant une note sans barème', async () => {
      // La base l'interdit ; l'écran ne doit pas pour autant afficher « /null ».
      simulerInscriptions({
        data: [inscription('i1', AICHA, { note_examen: 15.5, examen_bareme: null })],
      })

      await ouvrirLaConfirmation()

      expect(screen.queryByText(/note d'examen/)).not.toBeInTheDocument()
    })
  })
})
