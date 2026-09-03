import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SectionVisio } from '@/features/cours/components/SectionVisio'
import { useDefinirLienMeet } from '@/features/cours/hooks/useDefinirLienMeet'
import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'

vi.mock('@/features/cours/hooks/useDefinirLienMeet', () => ({ useDefinirLienMeet: vi.fn() }))

const useDefinirMock = vi.mocked(useDefinirLienMeet)
const mutate = vi.fn()

const LIEN = 'https://meet.google.com/abc-defg-hij'

function simuler(supplement: Record<string, unknown> = {}) {
  useDefinirMock.mockReturnValue({
    mutate,
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    ...supplement,
  } as unknown as ReturnType<typeof useDefinirLienMeet>)
}

function cours(lien_meet: string | null): CoursAvecDetails {
  return {
    id: 'c1',
    centre_id: 'centre-1',
    enseignant_id: 'moi',
    libelle: 'Groupe Hifz',
    type_cours_id: 'type-1',
    format: 'groupe',
    date_debut: '2026-07-01',
    date_fin: null,
    lien_meet,
    jeton_partage: null,
    session_id: 'session-1',
    niveau: null,
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

const champ = () => screen.getByLabelText('Lien du cours')
const bouton = () => screen.getByRole('button', { name: /Enregistrer le lien/ })

describe('SectionVisio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    simuler()
  })

  it('part de la valeur du serveur, sans la recopier dans un état', () => {
    render(<SectionVisio cours={cours(LIEN)} />)

    expect(champ()).toHaveValue(LIEN)
    // Rien n'a été saisi : il n'y a rien à enregistrer.
    expect(bouton()).toBeDisabled()
  })

  it('enregistre un lien saisi', async () => {
    const utilisateur = userEvent.setup()

    render(<SectionVisio cours={cours(null)} />)
    await utilisateur.type(champ(), LIEN)
    await utilisateur.click(bouton())

    expect(mutate).toHaveBeenCalledExactlyOnceWith(
      { coursId: 'c1', lien: LIEN },
      expect.anything()
    )
  })

  it('retire le lien quand on vide le champ', async () => {
    // `null` et non `''` : c'est ce que la base attend pour « aucun lien ».
    const utilisateur = userEvent.setup()

    render(<SectionVisio cours={cours(LIEN)} />)
    await utilisateur.clear(champ())
    await utilisateur.click(bouton())

    expect(mutate).toHaveBeenCalledExactlyOnceWith(
      { coursId: 'c1', lien: null },
      expect.anything()
    )
  })

  it('refuse une saisie qui n’est pas une URL', async () => {
    const utilisateur = userEvent.setup()

    render(<SectionVisio cours={cours(null)} />)
    await utilisateur.type(champ(), 'meet google')

    expect(screen.getByText(/URL valide/)).toBeInTheDocument()
    expect(bouton()).toBeDisabled()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('remonte le refus du serveur', () => {
    // Le message vient de la RPC (« seul l'enseignant de ce cours… ») : le
    // reformuler ici le ferait diverger.
    simuler({
      isError: true,
      error: new Error("Seul l'enseignant de ce cours peut en changer le lien."),
    })

    render(<SectionVisio cours={cours(null)} />)

    expect(
      screen.getByText("Seul l'enseignant de ce cours peut en changer le lien.")
    ).toBeInTheDocument()
  })
})
