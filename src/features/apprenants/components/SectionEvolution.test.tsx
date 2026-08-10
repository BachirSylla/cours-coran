import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SectionEvolution } from '@/features/apprenants/components/SectionEvolution'
import { useEvaluationsApprenant } from '@/features/apprenants/hooks/useEvaluationsApprenant'
import type {
  EvaluationLisible,
  EvolutionCours,
} from '@/features/apprenants/hooks/useEvaluationsApprenant'
import { noteEnPourcentage, tendance } from '@/shared/lib/evaluations'

vi.mock('@/features/apprenants/hooks/useEvaluationsApprenant', () => ({
  useEvaluationsApprenant: vi.fn(),
}))

const useEvaluationsMock = vi.mocked(useEvaluationsApprenant)

function evaluation(
  date: string,
  note: number,
  bareme = 20,
  extra: Partial<EvaluationLisible> = {}
): EvaluationLisible {
  return {
    id: `e-${date}`,
    date,
    note,
    note_bareme: bareme,
    pourcentage: noteEnPourcentage(note, bareme),
    commentaire: null,
    passage_evalue: null,
    ...extra,
  }
}

function evolution(
  cours_libelle: string,
  evaluations: EvaluationLisible[],
  cours_id = 'cours-1'
): EvolutionCours {
  return { cours_id, cours_libelle, evaluations, tendance: tendance(evaluations) }
}

function simuler(etat: Partial<ReturnType<typeof useEvaluationsApprenant>>) {
  useEvaluationsMock.mockReturnValue({
    parCours: [],
    total: 0,
    isPending: false,
    isError: false,
    error: null,
    ...etat,
  })
}

describe('SectionEvolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche un indicateur pendant le chargement', () => {
    simuler({ isPending: true })

    render(<SectionEvolution apprenantId="a1" />)

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('affiche l’erreur en cas d’échec', () => {
    simuler({ isError: true, error: new Error('Session expirée.') })

    render(<SectionEvolution apprenantId="a1" />)

    expect(screen.getByText('Session expirée.')).toBeInTheDocument()
  })

  it('invite à noter quand aucune récitation ne l’a été', () => {
    simuler({ parCours: [] })

    render(<SectionEvolution apprenantId="a1" />)

    expect(screen.getByText(/Aucune récitation notée pour le moment/)).toBeInTheDocument()
  })

  it('affiche un badge de progression', () => {
    simuler({
      parCours: [
        evolution('Groupe Hifz', [
          evaluation('2026-08-01', 8),
          evaluation('2026-08-08', 9),
          evaluation('2026-08-15', 14),
          evaluation('2026-08-22', 15),
        ]),
      ],
    })

    render(<SectionEvolution apprenantId="a1" />)

    expect(screen.getByText('En progression')).toBeInTheDocument()
  })

  it('affiche un badge de baisse', () => {
    simuler({
      parCours: [
        evolution('Groupe Hifz', [
          evaluation('2026-08-01', 16),
          evaluation('2026-08-08', 15),
          evaluation('2026-08-15', 9),
          evaluation('2026-08-22', 8),
        ]),
      ],
    })

    render(<SectionEvolution apprenantId="a1" />)

    expect(screen.getByText('En baisse')).toBeInTheDocument()
  })

  it('annonce clairement le manque de données', () => {
    simuler({ parCours: [evolution('Groupe Hifz', [evaluation('2026-08-01', 12)])] })

    render(<SectionEvolution apprenantId="a1" />)

    expect(screen.getByText('Pas assez de notes')).toBeInTheDocument()
  })

  it('liste les évaluations avec note, barème, passage et commentaire', () => {
    simuler({
      parCours: [
        evolution('Groupe Hifz', [
          evaluation('2026-08-01', 14.5, 20, {
            passage_evalue: 'Al-Baqara 1-20',
            commentaire: 'Bonne fluidité',
          }),
        ]),
      ],
    })

    render(<SectionEvolution apprenantId="a1" />)

    expect(screen.getByText('14,5/20')).toBeInTheDocument()
    expect(screen.getByText('Al-Baqara 1-20')).toBeInTheDocument()
    expect(screen.getByText('Bonne fluidité')).toBeInTheDocument()
    expect(screen.getByText('01/08/2026')).toBeInTheDocument()
  })

  it('affiche les notes de la plus récente à la plus ancienne', () => {
    simuler({
      parCours: [
        evolution('Groupe Hifz', [evaluation('2026-08-01', 10), evaluation('2026-08-08', 12)]),
      ],
    })

    render(<SectionEvolution apprenantId="a1" />)

    const dates = screen.getAllByText(/\d{2}\/08\/2026/).map((noeud) => noeud.textContent)
    expect(dates).toEqual(['08/08/2026', '01/08/2026'])
  })

  it('ne mélange pas deux cours', () => {
    simuler({
      parCours: [
        evolution('Groupe Hifz', [evaluation('2026-08-01', 10)], 'c1'),
        evolution('Lecture Aïcha', [evaluation('2026-08-02', 18)], 'c2'),
      ],
    })

    render(<SectionEvolution apprenantId="a1" />)

    expect(screen.getByText('Groupe Hifz')).toBeInTheDocument()
    expect(screen.getByText('Lecture Aïcha')).toBeInTheDocument()
    expect(screen.getByText('10/20')).toBeInTheDocument()
    expect(screen.getByText('18/20')).toBeInTheDocument()
  })

  it('trace une courbe à partir de deux notes, pas d’une seule', () => {
    simuler({ parCours: [evolution('Groupe Hifz', [evaluation('2026-08-01', 10)])] })
    const { unmount } = render(<SectionEvolution apprenantId="a1" />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    unmount()

    simuler({
      parCours: [
        evolution('Groupe Hifz', [evaluation('2026-08-01', 10), evaluation('2026-08-08', 15)]),
      ],
    })
    render(<SectionEvolution apprenantId="a1" />)

    expect(screen.getByRole('img', { name: /Évolution des notes/ })).toBeInTheDocument()
  })
})
