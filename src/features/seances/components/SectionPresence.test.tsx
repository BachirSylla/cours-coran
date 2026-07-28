import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'

import { useInscriptionsCours } from '@/features/inscriptions/hooks/useInscriptionsCours'
import { SectionPresence } from '@/features/seances/components/SectionPresence'
import { useDefinirPresence } from '@/features/seances/hooks/useDefinirPresence'
import { usePresences } from '@/features/seances/hooks/usePresences'
import type { Apprenant } from '@/shared/supabase/apprenantRepo'
import type { InscriptionAvecApprenant } from '@/shared/supabase/inscriptionRepo'
import type { PresenceAvecApprenant } from '@/shared/supabase/presenceRepo'

vi.mock('@/features/inscriptions/hooks/useInscriptionsCours', () => ({
  useInscriptionsCours: vi.fn(),
}))
vi.mock('@/features/seances/hooks/usePresences', () => ({ usePresences: vi.fn() }))
vi.mock('@/features/seances/hooks/useDefinirPresence', () => ({ useDefinirPresence: vi.fn() }))

const useInscriptionsMock = vi.mocked(useInscriptionsCours)
const usePresencesMock = vi.mocked(usePresences)
const useDefinirMock = vi.mocked(useDefinirPresence)

const mutate = vi.fn()

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

const AICHA = apprenant('a1', 'Aïcha', 'Diallo')
const MOUSSA = apprenant('a2', 'Moussa', 'Camara')

function inscription(id: string, personne: Apprenant): InscriptionAvecApprenant {
  return {
    id,
    owner_id: 'proprietaire',
    apprenant_id: personne.id,
    cours_id: 'cours-1',
    created_at: '2026-07-27T10:00:00Z',
    updated_at: '2026-07-27T10:00:00Z',
    apprenant: personne,
  }
}

function presence(apprenantId: string, present: boolean): PresenceAvecApprenant {
  return {
    id: `p-${apprenantId}`,
    owner_id: 'proprietaire',
    seance_id: 'seance-1',
    apprenant_id: apprenantId,
    present,
    created_at: '2026-07-27T10:00:00Z',
    updated_at: '2026-07-27T10:00:00Z',
    apprenant: null,
  }
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

describe('SectionPresence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useInscriptionsMock.mockReturnValue(
      requete([inscription('i1', AICHA), inscription('i2', MOUSSA)])
    )
    usePresencesMock.mockReturnValue(requete([]))
    useDefinirMock.mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useDefinirPresence>)
  })

  it('désactive les cases tant que la séance n’est pas enregistrée, en l’expliquant', () => {
    render(<SectionPresence coursId="cours-1" seanceId={undefined} />)

    expect(
      screen.getByText('Enregistrez la séance pour noter les présences.')
    ).toBeInTheDocument()
    for (const case_ of screen.getAllByRole('checkbox')) {
      expect(case_).toBeDisabled()
    }
  })

  it('active les cases une fois la séance enregistrée', () => {
    render(<SectionPresence coursId="cours-1" seanceId="seance-1" />)

    expect(
      screen.queryByText('Enregistrez la séance pour noter les présences.')
    ).not.toBeInTheDocument()
    for (const case_ of screen.getAllByRole('checkbox')) {
      expect(case_).toBeEnabled()
    }
  })

  it('considère un apprenant sans ligne de présence comme présent', () => {
    render(<SectionPresence coursId="cours-1" seanceId="seance-1" />)

    expect(screen.getAllByText('Présent')).toHaveLength(2)
    expect(screen.queryByText('Absent')).not.toBeInTheDocument()
  })

  it('reflète les présences enregistrées', () => {
    usePresencesMock.mockReturnValue(requete([presence('a1', false)]))

    render(<SectionPresence coursId="cours-1" seanceId="seance-1" />)

    expect(screen.getByText('Absent')).toBeInTheDocument()
    expect(screen.getAllByText('Présent')).toHaveLength(1)
  })

  it('bascule un apprenant vers absent au décochage', async () => {
    const utilisateur = userEvent.setup()

    render(<SectionPresence coursId="cours-1" seanceId="seance-1" />)

    await utilisateur.click(screen.getByRole('checkbox', { name: /Aïcha Diallo/ }))

    expect(mutate).toHaveBeenCalledWith({
      seanceId: 'seance-1',
      apprenantId: 'a1',
      present: false,
    })
  })

  it('re-coche un apprenant absent', async () => {
    usePresencesMock.mockReturnValue(requete([presence('a1', false)]))
    const utilisateur = userEvent.setup()

    render(<SectionPresence coursId="cours-1" seanceId="seance-1" />)

    await utilisateur.click(screen.getByRole('checkbox', { name: /Aïcha Diallo/ }))

    expect(mutate).toHaveBeenCalledWith({
      seanceId: 'seance-1',
      apprenantId: 'a1',
      present: true,
    })
  })

  it('affiche un état vide quand le cours n’a aucun inscrit', () => {
    useInscriptionsMock.mockReturnValue(requete([]))

    render(<SectionPresence coursId="cours-1" seanceId="seance-1" />)

    expect(screen.getByText('Aucun apprenant inscrit à ce cours.')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
