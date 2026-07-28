import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { addDays, addWeeks } from 'date-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { chaineDepuisDate, dateDepuisChaine } from '@/shared/lib/seances'

import { useSeancesSemaine } from '@/features/seances/hooks/useSeancesSemaine'
import type { SeanceVueEnrichie } from '@/features/seances/regroupement'
import { SeancesSemainePage } from '@/features/seances/SeancesSemainePage'
import type { Seance } from '@/shared/supabase/seanceRepo'

vi.mock('@/features/seances/hooks/useSeancesSemaine', () => ({ useSeancesSemaine: vi.fn() }))
// Le dialog monte ses propres requêtes : il n'est pas le sujet de ce test.
vi.mock('@/features/seances/components/SeanceFormDialog', () => ({
  SeanceFormDialog: ({ vue }: { vue: SeanceVueEnrichie | null }) =>
    vue ? <div role="dialog">Saisie {vue.cours_libelle}</div> : null,
}))

const useSeancesSemaineMock = vi.mocked(useSeancesSemaine)

function seance(date: string, statut = 'faite'): Seance {
  return {
    id: `s-${date}`,
    owner_id: 'proprietaire',
    cours_id: 'cours-1',
    date,
    heure_debut: '10:00:00',
    heure_fin: '11:00:00',
    statut,
    contenu_aborde: 'Nourania page 12',
    sourate: null,
    versets_de: null,
    versets_a: null,
    type_travail: null,
    exercices_a_faire: null,
    observations: null,
    created_at: '2026-07-27T10:00:00Z',
    updated_at: '2026-07-27T10:00:00Z',
  }
}

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
    ...options,
  }
}

function simuler(etat: Partial<ReturnType<typeof useSeancesSemaine>>) {
  useSeancesSemaineMock.mockReturnValue({
    vues: [],
    isPending: false,
    isError: false,
    error: null,
    ...etat,
  })
}

function afficher() {
  return render(
    <MemoryRouter>
      <SeancesSemainePage />
    </MemoryRouter>
  )
}

describe('SeancesSemainePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche un indicateur pendant le chargement', () => {
    simuler({ isPending: true })

    afficher()

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/chargement des séances/i)).toBeInTheDocument()
  })

  it('affiche l’erreur quand le chargement échoue', () => {
    simuler({ isError: true, error: new Error('Session expirée.') })

    afficher()

    expect(screen.getByText('Chargement impossible')).toBeInTheDocument()
    expect(screen.getByText('Session expirée.')).toBeInTheDocument()
  })

  it('affiche un état vide quand la semaine ne contient aucune séance', () => {
    simuler({ vues: [] })

    afficher()

    expect(screen.getByText('Aucune séance cette semaine')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /voir mes cours/i })).toHaveAttribute(
      'href',
      '/cours'
    )
  })

  it('liste les séances groupées par jour, à saisir ou déjà faites', () => {
    simuler({
      vues: [
        vue(),
        vue({
          date: '2026-07-29',
          jour_semaine: 3,
          saisie: true,
          seance: seance('2026-07-29'),
          cours_libelle: 'Lecture Aïcha',
        }),
      ],
    })

    afficher()

    expect(screen.getByText('Groupe Hifz')).toBeInTheDocument()
    expect(screen.getByText('Lecture Aïcha')).toBeInTheDocument()
    expect(screen.getByText('À saisir')).toBeInTheDocument()
    expect(screen.getByText('Faite')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /lundi/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /mercredi/i })).toBeInTheDocument()
  })

  it('signale une séance hors planning', () => {
    simuler({
      vues: [
        vue({
          date: '2026-07-28',
          jour_semaine: null,
          heure_debut: '14:00:00',
          heure_fin: null,
          saisie: true,
          orpheline: true,
          seance: seance('2026-07-28'),
        }),
      ],
    })

    afficher()

    expect(screen.getByText('Hors planning')).toBeInTheDocument()
  })

  it('ouvre la saisie au clic sur une séance', async () => {
    simuler({ vues: [vue()] })
    const utilisateur = userEvent.setup()

    afficher()

    await utilisateur.click(screen.getByRole('button', { name: /Groupe Hifz/ }))

    expect(screen.getByRole('dialog')).toHaveTextContent('Saisie Groupe Hifz')
  })

  it('change de semaine et redemande la plage correspondante', async () => {
    simuler({ vues: [] })
    const utilisateur = userEvent.setup()

    afficher()

    const premierAppel = useSeancesSemaineMock.mock.calls[0]
    await utilisateur.click(screen.getByRole('button', { name: /semaine suivante/i }))
    const dernierAppel = useSeancesSemaineMock.mock.calls.at(-1)

    const [debutAvant] = premierAppel ?? []
    const [debutApres, finApres] = dernierAppel ?? []

    // Exactement une semaine plus tard, et toujours une fenêtre de 7 jours.
    expect(debutApres).toBe(chaineDepuisDate(addWeeks(dateDepuisChaine(debutAvant!), 1)))
    expect(finApres).toBe(chaineDepuisDate(addDays(dateDepuisChaine(debutApres!), 6)))
  })

  it('propose le retour à aujourd’hui uniquement hors de la semaine courante', async () => {
    simuler({ vues: [] })
    const utilisateur = userEvent.setup()

    afficher()

    expect(screen.getByRole('button', { name: /aujourd/i })).toBeDisabled()

    await utilisateur.click(screen.getByRole('button', { name: /semaine précédente/i }))

    expect(screen.getByRole('button', { name: /aujourd/i })).toBeEnabled()
  })
})
