import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SeanceFormDialog } from '@/features/seances/components/SeanceFormDialog'
import { useEnregistrerSeance } from '@/features/seances/hooks/useEnregistrerSeance'
import { useSeancesCours } from '@/features/seances/hooks/useSeancesCours'
import type { SeanceVueEnrichie } from '@/features/seances/regroupement'

/**
 * Le sujet ici est la **condition d'affichage** de la section d'évaluation,
 * pas son contenu — qui a ses propres tests. On la remplace donc par un témoin
 * qui expose les props reçues.
 */
vi.mock('@/features/seances/components/SectionPresence', () => ({
  SectionPresence: ({
    coursId,
    passageSuggere,
  }: {
    coursId: string
    passageSuggere?: string | null
  }) => (
    <div
      data-testid="section-presence"
      data-cours={coursId}
      data-passage={passageSuggere ?? ''}
    >
      Présence et évaluation
    </div>
  ),
}))
vi.mock('@/features/seances/hooks/useEnregistrerSeance', () => ({
  useEnregistrerSeance: vi.fn(),
}))
vi.mock('@/features/seances/hooks/useSeancesCours', () => ({ useSeancesCours: vi.fn() }))

const useEnregistrerMock = vi.mocked(useEnregistrerSeance)
const useSeancesCoursMock = vi.mocked(useSeancesCours)

function vue(options: Partial<SeanceVueEnrichie> = {}): SeanceVueEnrichie {
  return {
    cours_id: 'cours-1',
    date: '2026-07-27',
    jour_semaine: 1,
    heure_debut: '10:00:00',
    heure_fin: '11:00:00',
    seance: null,
    saisie: false,
    orpheline: false,
    cours_libelle: 'Groupe Hifz',
    type_libelle: 'Mémorisation',
    format: 'groupe',
    enseignant_id: null,
    ...options,
  }
}

describe('SeanceFormDialog — section d’évaluation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useEnregistrerMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
    } as unknown as ReturnType<typeof useEnregistrerSeance>)
    useSeancesCoursMock.mockReturnValue({ data: [] } as unknown as ReturnType<
      typeof useSeancesCours
    >)
  })

  it('affiche la section pour un cours de groupe', () => {
    render(<SeanceFormDialog vue={vue({ format: 'groupe' })} onOuvertChange={vi.fn()} />)

    expect(screen.getByTestId('section-presence')).toBeInTheDocument()
  })

  it('affiche la section pour un cours individuel', () => {
    // La régression corrigée : la section était réservée aux groupes, alors que
    // le tête-à-tête est justement le cas où l'évaluation compte le plus.
    render(
      <SeanceFormDialog
        vue={vue({ format: 'individuel', cours_libelle: 'Initiation Ali' })}
        onOuvertChange={vi.fn()}
      />
    )

    expect(screen.getByTestId('section-presence')).toBeInTheDocument()
  })

  it('affiche la section même pour un format inattendu', () => {
    render(<SeanceFormDialog vue={vue({ format: 'autre' })} onOuvertChange={vi.fn()} />)

    expect(screen.getByTestId('section-presence')).toBeInTheDocument()
  })

  it('transmet le cours et le passage suggéré à la section', () => {
    useSeancesCoursMock.mockReturnValue({
      data: [
        {
          id: 's1',
          cours_id: 'cours-1',
          date: '2026-07-20',
          heure_debut: '10:00:00',
          heure_fin: '11:00:00',
          statut: 'faite',
          contenu_aborde: null,
          sourate: null,
          sourate_numero: null,
          versets_de: null,
          versets_a: null,
          type_travail: null,
          exercices_a_faire: 'Réviser 1 à 20',
          observations: null,
          created_at: '2026-07-20T10:00:00Z',
          updated_at: '2026-07-20T10:00:00Z',
        },
      ],
    } as unknown as ReturnType<typeof useSeancesCours>)

    render(<SeanceFormDialog vue={vue({ format: 'individuel' })} onOuvertChange={vi.fn()} />)

    const section = screen.getByTestId('section-presence')
    expect(section).toHaveAttribute('data-cours', 'cours-1')
    expect(section).toHaveAttribute('data-passage', 'Réviser 1 à 20')
  })

  it('ne rend rien tant qu’aucune séance n’est sélectionnée', () => {
    render(<SeanceFormDialog vue={null} onOuvertChange={vi.fn()} />)

    expect(screen.queryByTestId('section-presence')).not.toBeInTheDocument()
  })
})
