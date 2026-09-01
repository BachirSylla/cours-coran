import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'

import { BlocPresenceIndisponible } from '@/features/seances/components/BlocPresenceIndisponible'
import { usePresences } from '@/features/seances/hooks/usePresences'
import { useRetirerPresences } from '@/features/seances/hooks/useRetirerPresences'
import type { PresenceAvecApprenant } from '@/shared/supabase/presenceRepo'

vi.mock('@/features/seances/hooks/usePresences', () => ({ usePresences: vi.fn() }))
vi.mock('@/features/seances/hooks/useRetirerPresences', () => ({
  useRetirerPresences: vi.fn(),
}))

const usePresencesMock = vi.mocked(usePresences)
const useRetirerMock = vi.mocked(useRetirerPresences)

const retirer = vi.fn()

function presence(id: string, note: number | null): PresenceAvecApprenant {
  return {
    id,
    centre_id: 'c',
    seance_id: 'seance-1',
    cours_id: 'cours-1',
    apprenant_id: `a-${id}`,
    present: true,
    etat: 'present',
    note,
    note_bareme: note === null ? null : 20,
    commentaire: null,
    passage_evalue: null,
    created_at: 'x',
    updated_at: 'x',
    apprenant: null,
  }
}

function requete<T>(donnees: T) {
  return { data: donnees, isPending: false, isError: false, error: null } as UseQueryResult<
    T,
    Error
  >
}

describe('BlocPresenceIndisponible', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    usePresencesMock.mockReturnValue(requete<PresenceAvecApprenant[]>([]))
    useRetirerMock.mockReturnValue({
      mutate: retirer,
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useRetirerPresences>)
  })

  /*
   * Le bloc reste VISIBLE plutôt que d'être escamoté : une section qui
   * disparaît sans un mot se lit comme une panne, et l'enseignant chercherait
   * où sont passées ses cases.
   */
  it('explique le refus de statut et renvoie vers le motif', () => {
    render(<BlocPresenceIndisponible refus="statut" seanceId="seance-1" />)

    expect(screen.getByText(/Cette séance n'a pas eu lieu/)).toBeInTheDocument()
    expect(screen.getByText(/champ « Motif »/)).toBeInTheDocument()
  })

  it('explique le refus de date sans parler de motif', () => {
    render(<BlocPresenceIndisponible refus="date" seanceId="seance-1" />)

    expect(screen.getByText(/n'a pas encore eu lieu/)).toBeInTheDocument()
    expect(screen.queryByText(/champ « Motif »/)).not.toBeInTheDocument()
  })

  it('ne propose rien à retirer quand aucun pointage n’existe', () => {
    render(<BlocPresenceIndisponible refus="statut" seanceId="seance-1" />)

    expect(screen.queryByRole('button', { name: /Retirer les pointages/ })).not.toBeInTheDocument()
  })

  /*
   * La base REFUSE de faire quitter « faite » à une séance qui porte des
   * pointages (P0051), plutôt que de les supprimer en silence. Le refus doit
   * donc s'accompagner de la sortie, sinon l'enseignant est coincé.
   */
  it('annonce les pointages existants et le blocage à venir', () => {
    usePresencesMock.mockReturnValue(requete([presence('p1', 17), presence('p2', null)]))

    render(<BlocPresenceIndisponible refus="statut" seanceId="seance-1" />)

    expect(screen.getByText(/2 pointages déjà saisis/)).toBeInTheDocument()
    expect(screen.getByText(/dont 1 avec une note/)).toBeInTheDocument()
    expect(screen.getByText(/L'enregistrement sera refusé/)).toBeInTheDocument()
  })

  it('ne retire les pointages qu’après une confirmation qui dit ce qui est perdu', async () => {
    const utilisateur = userEvent.setup()
    usePresencesMock.mockReturnValue(requete([presence('p1', 17), presence('p2', null)]))

    render(<BlocPresenceIndisponible refus="statut" seanceId="seance-1" />)

    await utilisateur.click(screen.getByRole('button', { name: /Retirer les pointages/ }))
    expect(retirer).not.toHaveBeenCalled()

    expect(screen.getByText(/ainsi que les 1 note\(s\)/)).toBeInTheDocument()

    await utilisateur.click(screen.getByRole('button', { name: 'Retirer' }))

    expect(retirer).toHaveBeenCalledWith('seance-1')
  })

  it('renonce sur Annuler', async () => {
    const utilisateur = userEvent.setup()
    usePresencesMock.mockReturnValue(requete([presence('p1', 17)]))

    render(<BlocPresenceIndisponible refus="statut" seanceId="seance-1" />)

    await utilisateur.click(screen.getByRole('button', { name: /Retirer les pointages/ }))
    await utilisateur.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(retirer).not.toHaveBeenCalled()
  })

  it('ne cache pas le refus de la base', () => {
    usePresencesMock.mockReturnValue(requete([presence('p1', 17)]))
    useRetirerMock.mockReturnValue({
      mutate: retirer,
      isPending: false,
      isError: true,
      error: new Error('Suppression des présences de la séance : accès refusé.'),
    } as unknown as ReturnType<typeof useRetirerPresences>)

    render(<BlocPresenceIndisponible refus="statut" seanceId="seance-1" />)

    expect(screen.getByText(/accès refusé/)).toBeInTheDocument()
  })
})
