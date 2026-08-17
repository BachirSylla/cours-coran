import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'

import { useCoursPublic } from '@/features/partage/hooks/useCoursPublic'
import { PageCoursPublic } from '@/features/partage/PageCoursPublic'
import type { CoursPublic } from '@/shared/supabase/coursPublicSchema'

vi.mock('@/features/partage/hooks/useCoursPublic', () => ({ useCoursPublic: vi.fn() }))

const useCoursPublicMock = vi.mocked(useCoursPublic)

const JETON = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
/** Lundi 17 août 2026, 9h00. */
const LUNDI_9H = new Date(2026, 7, 17, 9, 0)

function cours(extra: Partial<CoursPublic> = {}): CoursPublic {
  return {
    libelle: 'Coran Ramadan Samedi',
    type_libelle: 'Initiation à la lecture du Coran',
    lien_meet: 'https://meet.google.com/dxq-uubq-ewc',
    date_debut: '2026-07-01',
    date_fin: null,
    statut: 'actif',
    creneaux: [{ jour_semaine: 1, heure_debut: '10:00:00', heure_fin: '11:00:00' }],
    dernier_exercice: null,
    ...extra,
  }
}

function simuler(etat: Partial<UseQueryResult<CoursPublic | null, Error>>) {
  useCoursPublicMock.mockReturnValue({
    data: null,
    isPending: false,
    isError: false,
    error: null,
    ...etat,
  } as UseQueryResult<CoursPublic | null, Error>)
}

function rendre() {
  return render(
    <MemoryRouter initialEntries={[`/c/${JETON}`]}>
      <Routes>
        <Route path="/c/:jeton" element={<PageCoursPublic />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('PageCoursPublic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(LUNDI_9H)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('affiche un indicateur pendant le chargement', () => {
    simuler({ isPending: true })

    rendre()

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('affiche le cours et sa prochaine séance', () => {
    simuler({ data: cours() })

    rendre()

    expect(
      screen.getByRole('heading', { name: 'Coran Ramadan Samedi', level: 1 })
    ).toBeInTheDocument()
    expect(screen.getByText('Initiation à la lecture du Coran')).toBeInTheDocument()

    // L'horaire apparaît deux fois — ici et dans les horaires hebdomadaires —
    // donc on interroge le bloc « Prochaine séance » lui-même.
    const annonce = screen.getByText('Prochaine séance').parentElement
    expect(annonce).not.toBeNull()
    expect(within(annonce as HTMLElement).getByText('lundi 17 août')).toBeInTheDocument()
    expect(within(annonce as HTMLElement).getByText('10:00 – 11:00')).toBeInTheDocument()
  })

  it('propose un bouton Rejoindre qui ouvre le lien dans un nouvel onglet', () => {
    simuler({ data: cours() })

    rendre()

    const bouton = screen.getByRole('link', { name: /Rejoindre le cours/ })
    expect(bouton).toHaveAttribute('href', 'https://meet.google.com/dxq-uubq-ewc')
    expect(bouton).toHaveAttribute('target', '_blank')
    // `noreferrer` : le jeton, qui est dans l'URL, ne doit pas partir chez Meet.
    expect(bouton).toHaveAttribute('rel', expect.stringContaining('noreferrer'))
  })

  it('explique l’absence de lien plutôt que d’afficher un bouton mort', () => {
    simuler({ data: cours({ lien_meet: null }) })

    rendre()

    expect(screen.queryByRole('link', { name: /Rejoindre le cours/ })).not.toBeInTheDocument()
    expect(screen.getByText(/n'a pas encore été ajouté/)).toBeInTheDocument()
  })

  it('affiche les horaires de la semaine', () => {
    simuler({
      data: cours({
        creneaux: [
          { jour_semaine: 1, heure_debut: '10:00:00', heure_fin: '11:00:00' },
          { jour_semaine: 6, heure_debut: '15:00:00', heure_fin: '17:00:00' },
        ],
      }),
    })

    rendre()

    expect(screen.getByText('Lundi')).toBeInTheDocument()
    expect(screen.getByText('Samedi')).toBeInTheDocument()
    expect(screen.getByText('15:00 – 17:00')).toBeInTheDocument()
  })

  it('affiche le dernier exercice donné', () => {
    simuler({ data: cours({ dernier_exercice: 'Réviser la page 72.' }) })

    rendre()

    expect(screen.getByText('À réviser pour la prochaine fois')).toBeInTheDocument()
    expect(screen.getByText('Réviser la page 72.')).toBeInTheDocument()
  })

  it('n’affiche pas le bloc exercice quand il n’y en a pas', () => {
    simuler({ data: cours() })

    rendre()

    expect(screen.queryByText('À réviser pour la prochaine fois')).not.toBeInTheDocument()
  })

  it('annonce un cours terminé, sans bouton Rejoindre', () => {
    simuler({ data: cours({ statut: 'termine', lien_meet: null }) })

    rendre()

    expect(screen.getByText('Ce cours est terminé.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Rejoindre le cours/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/n'a pas encore été ajouté/)).not.toBeInTheDocument()
  })

  it('annonce une pause sans se contredire par un bouton Rejoindre', () => {
    // Même si la base transmettait encore le lien, l'écran doit refuser.
    simuler({ data: cours({ statut: 'pause' }) })

    rendre()

    expect(screen.getByText(/Ce cours est en pause/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Rejoindre le cours/ })).not.toBeInTheDocument()
  })

  it('accueille poliment un jeton invalide', () => {
    simuler({ data: null })

    rendre()

    expect(
      screen.getByRole('heading', { name: /Ce lien n'est plus valide/ })
    ).toBeInTheDocument()
    expect(screen.getByText(/Demandez-en un nouveau à votre enseignant/)).toBeInTheDocument()
  })

  it('donne le même message accueillant en cas d’erreur technique', () => {
    simuler({ isError: true, error: new Error('Failed to fetch') })

    rendre()

    expect(
      screen.getByRole('heading', { name: /Ce lien n'est plus valide/ })
    ).toBeInTheDocument()
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument()
  })

  it('n’offre aucune navigation vers l’application', () => {
    simuler({ data: cours() })

    rendre()

    // Le seul lien de la page est celui de la visioconférence.
    const liens = screen.getAllByRole('link')
    expect(liens).toHaveLength(1)
    expect(liens[0]).toHaveAttribute('href', 'https://meet.google.com/dxq-uubq-ewc')
  })

  it('demande aux moteurs de recherche de ne pas indexer la page', () => {
    simuler({ data: cours() })

    rendre()

    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow'
    )
  })
})
