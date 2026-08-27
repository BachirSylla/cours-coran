import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ExportRapportDialog } from '@/features/rapport/components/ExportRapportDialog'
import { useRapportCours } from '@/features/rapport/hooks/useRapportCours'
import { NOTATION_PAR_DEFAUT } from '@/shared/lib/rapport'
import { construireRapport, type SeanceRapport } from '@/shared/lib/rapportSession'

vi.mock('@/features/rapport/hooks/useRapportCours', () => ({ useRapportCours: vi.fn() }))

const useRapportMock = vi.mocked(useRapportCours)

function seance(id: string, date: string): SeanceRapport {
  return {
    id,
    date,
    statut: 'faite',
    sourate: null,
    versets_de: null,
    versets_a: null,
    contenu_aborde: null,
    presence: [],
  }
}

const SEANCES = [
  seance('s1', '2026-03-01'),
  seance('s2', '2026-03-08'),
  seance('s3', '2026-04-05'),
]

/**
 * Le hook est mocké, mais on lui fait appliquer la vraie période reçue : c'est
 * ce qui rend le compteur du dialogue significatif.
 */
function brancherHook() {
  useRapportMock.mockImplementation((_coursId, periode) => ({
    cours: null,
    rapport: construireRapport({
      seances: SEANCES,
      inscrits: [
        {
          apprenant_id: 'a1',
          prenom: 'Aïcha',
          nom: 'Diallo',
          note_examen: null,
          examen_bareme: null,
        },
      ],
      config: NOTATION_PAR_DEFAUT,
      periode,
    }),
    logo: null,
    isPending: false,
    isError: false,
    error: null,
  }))
}

function rendre() {
  return render(<ExportRapportDialog coursId="c1" ouvert onOuvertChange={vi.fn()} />)
}

const lienGenerer = () => screen.getByRole('link', { name: /Générer/ })

describe('ExportRapportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    brancherHook()
  })

  it('prend tout le cours par défaut', () => {
    rendre()

    expect(screen.getByRole('checkbox', { name: /plage de dates/i })).not.toBeChecked()
    expect(screen.queryByLabelText('Du')).not.toBeInTheDocument()
    expect(lienGenerer()).toHaveAttribute('href', '/cours/c1/rapport')
  })

  it('annonce ce que la période retiendra', () => {
    rendre()

    expect(screen.getByText('3 séances · 1 apprenant')).toBeInTheDocument()
  })

  it('révèle les deux dates quand on limite la période', async () => {
    const utilisateur = userEvent.setup()
    rendre()

    await utilisateur.click(screen.getByRole('checkbox', { name: /plage de dates/i }))

    expect(screen.getByLabelText('Du')).toBeInTheDocument()
    expect(screen.getByLabelText('Au')).toBeInTheDocument()
  })

  it('porte la plage dans l’URL', async () => {
    const utilisateur = userEvent.setup()
    rendre()

    await utilisateur.click(screen.getByRole('checkbox', { name: /plage de dates/i }))
    await utilisateur.type(screen.getByLabelText('Du'), '2026-03-01')
    await utilisateur.type(screen.getByLabelText('Au'), '2026-03-31')

    expect(lienGenerer()).toHaveAttribute(
      'href',
      '/cours/c1/rapport?du=2026-03-01&au=2026-03-31'
    )
  })

  it('met à jour le compteur quand la période se resserre', async () => {
    const utilisateur = userEvent.setup()
    rendre()

    await utilisateur.click(screen.getByRole('checkbox', { name: /plage de dates/i }))
    await utilisateur.type(screen.getByLabelText('Du'), '2026-03-01')
    await utilisateur.type(screen.getByLabelText('Au'), '2026-03-31')

    // La séance du 5 avril sort de la plage.
    expect(screen.getByText('2 séances · 1 apprenant')).toBeInTheDocument()
  })

  it('oublie la plage si l’on décoche, sans effacer la saisie', async () => {
    const utilisateur = userEvent.setup()
    rendre()

    await utilisateur.click(screen.getByRole('checkbox', { name: /plage de dates/i }))
    await utilisateur.type(screen.getByLabelText('Du'), '2026-03-01')
    await utilisateur.click(screen.getByRole('checkbox', { name: /plage de dates/i }))

    expect(lienGenerer()).toHaveAttribute('href', '/cours/c1/rapport')
  })

  it('porte les mentions d’en-tête dans l’URL', async () => {
    const utilisateur = userEvent.setup()
    rendre()

    await utilisateur.type(screen.getByLabelText('Niveau'), '9')
    await utilisateur.type(screen.getByLabelText('Session'), '16')
    await utilisateur.type(screen.getByLabelText('Centre'), 'Dakar Plateau')

    expect(lienGenerer()).toHaveAttribute(
      'href',
      '/cours/c1/rapport?niveau=9&session=16&centre=Dakar+Plateau'
    )
  })

  it('ouvre le rapport dans un nouvel onglet', () => {
    rendre()

    expect(lienGenerer()).toHaveAttribute('target', '_blank')
    expect(lienGenerer()).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })
})
