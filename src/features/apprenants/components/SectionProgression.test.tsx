import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SectionProgression } from '@/features/apprenants/components/SectionProgression'
import { useProgressionApprenant } from '@/features/apprenants/hooks/useProgressionApprenant'
import type { ProgressionCours } from '@/features/apprenants/hooks/useProgressionApprenant'
import { calculerProgression, type SeanceProgression } from '@/shared/lib/progression'
import type { Seance } from '@/shared/supabase/seanceRepo'

vi.mock('@/features/apprenants/hooks/useProgressionApprenant', () => ({
  useProgressionApprenant: vi.fn(),
}))

const useProgressionMock = vi.mocked(useProgressionApprenant)

function seance(date: string, options: Partial<Seance> = {}): Seance {
  return {
    id: `s-${date}`,
    centre_id: 'centre-1',
    cours_id: 'cours-1',
    date,
    heure_debut: '10:00:00',
    heure_fin: '11:00:00',
    statut: 'faite',
    contenu_aborde: null,
    sourate: null,
    sourate_numero: null,
    versets_de: null,
    versets_a: null,
    type_travail: null,
    exercices_a_faire: null,
    observations: null,
    motif: null,
    created_at: '2026-07-27T10:00:00Z',
    updated_at: '2026-07-27T10:00:00Z',
    ...options,
  }
}

function entree(
  libelle: string,
  type_libelle: string | null,
  seances: Seance[],
  id = 'cours-1'
): ProgressionCours {
  return {
    cours: { id, libelle, type_libelle, format: 'individuel' },
    progression: calculerProgression(seances as SeanceProgression[], type_libelle),
    seances,
  }
}

function simuler(etat: Partial<ReturnType<typeof useProgressionApprenant>>) {
  useProgressionMock.mockReturnValue({
    progressions: [],
    seancesRecentes: [],
    isPending: false,
    isError: false,
    error: null,
    ...etat,
  })
}

describe('SectionProgression', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche un indicateur pendant le calcul', () => {
    simuler({ isPending: true })

    render(<SectionProgression apprenantId="a1" />)

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/calcul de la progression/i)).toBeInTheDocument()
  })

  it('affiche l’erreur en cas d’échec', () => {
    simuler({ isError: true, error: new Error('Session expirée.') })

    render(<SectionProgression apprenantId="a1" />)

    expect(screen.getByText('Session expirée.')).toBeInTheDocument()
  })

  it('invite à inscrire l’apprenant quand il ne suit aucun cours', () => {
    simuler({ progressions: [] })

    render(<SectionProgression apprenantId="a1" />)

    expect(
      screen.getByText('Inscrivez cet apprenant à un cours pour suivre sa progression.')
    ).toBeInTheDocument()
  })

  it('signale un cours sans séance faite', () => {
    simuler({ progressions: [entree('Groupe Hifz', 'Mémorisation', [])] })

    render(<SectionProgression apprenantId="a1" />)

    expect(screen.getByText('Aucune séance faite pour ce cours.')).toBeInTheDocument()
    expect(screen.getByText('0 séance')).toBeInTheDocument()
  })

  it('met en avant le contenu pour un cours d’initiation', () => {
    simuler({
      progressions: [
        entree('Initiation Ali', 'Initiation à la lecture du Coran', [
          seance('2026-07-27', { contenu_aborde: 'Nourania page 10' }),
          seance('2026-08-03', { contenu_aborde: 'Nourania page 12' }),
        ]),
      ],
    })

    render(<SectionProgression apprenantId="a1" />)

    expect(screen.getByText('Dernier contenu abordé')).toBeInTheDocument()
    expect(screen.getByText('Nourania page 12 · 03/08/2026')).toBeInTheDocument()
    expect(screen.queryByText('Dernier passage travaillé')).not.toBeInTheDocument()
    expect(screen.getByText('2 séances')).toBeInTheDocument()
  })

  it('met en avant la position pour un cours de mémorisation', () => {
    simuler({
      progressions: [
        entree('Groupe Hifz', 'Mémorisation', [
          seance('2026-07-27', {
            sourate: 'Al-Baqara',
            versets_de: 1,
            versets_a: 20,
            type_travail: 'nouvelle_memorisation',
          }),
        ]),
      ],
    })

    render(<SectionProgression apprenantId="a1" />)

    expect(screen.getByText('Dernier passage travaillé')).toBeInTheDocument()
    expect(screen.getByText('Al-Baqara, versets 1 à 20 · 27/07/2026')).toBeInTheDocument()
    expect(screen.getByText('1 nouvelle(s) mémorisation(s)')).toBeInTheDocument()
  })

  it('distingue la dernière nouvelle mémorisation d’une révision plus récente', () => {
    simuler({
      progressions: [
        entree('Groupe Hifz', 'Mémorisation', [
          seance('2026-07-27', {
            sourate: 'Al-Baqara',
            versets_de: 1,
            versets_a: 20,
            type_travail: 'nouvelle_memorisation',
          }),
          seance('2026-08-03', {
            sourate: 'Al-Fatiha',
            versets_de: 1,
            versets_a: 7,
            type_travail: 'revision',
          }),
        ]),
      ],
    })

    render(<SectionProgression apprenantId="a1" />)

    // Le dernier travail est la révision…
    expect(screen.getByText('Al-Fatiha, versets 1 à 7 · 03/08/2026')).toBeInTheDocument()
    // …mais le front de mémorisation reste affiché à part.
    expect(screen.getByText('Dernière nouvelle mémorisation')).toBeInTheDocument()
    expect(screen.getByText('Al-Baqara, versets 1 à 20 · 27/07/2026')).toBeInTheDocument()
  })

  it('affiche le dernier exercice donné', () => {
    simuler({
      progressions: [
        entree('Groupe Hifz', 'Mémorisation', [
          seance('2026-07-27', { exercices_a_faire: 'Relire 5 fois' }),
        ]),
      ],
    })

    render(<SectionProgression apprenantId="a1" />)

    expect(screen.getByText('Dernier exercice donné')).toBeInTheDocument()
    expect(screen.getByText('Relire 5 fois · 27/07/2026')).toBeInTheDocument()
  })

  it('affiche l’historique des dernières séances, avec les exercices', () => {
    simuler({
      progressions: [entree('Groupe Hifz', 'Mémorisation', [])],
      seancesRecentes: [
        {
          seance: seance('2026-08-03', {
            contenu_aborde: 'Al-Fatiha révisée',
            exercices_a_faire: 'Mémoriser 3 versets',
          }),
          cours_libelle: 'Groupe Hifz',
        },
      ],
    })

    render(<SectionProgression apprenantId="a1" />)

    expect(screen.getByText('Dernières séances')).toBeInTheDocument()
    expect(screen.getByText('Al-Fatiha révisée')).toBeInTheDocument()
    expect(screen.getByText('Mémoriser 3 versets')).toBeInTheDocument()
  })

  it('affiche une carte par cours suivi', () => {
    simuler({
      progressions: [
        entree('Groupe Hifz', 'Mémorisation', [], 'c1'),
        entree('Initiation Ali', 'Initiation Nourania', [], 'c2'),
      ],
    })

    render(<SectionProgression apprenantId="a1" />)

    expect(screen.getByText('Groupe Hifz')).toBeInTheDocument()
    expect(screen.getByText('Initiation Ali')).toBeInTheDocument()
  })
})
