import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ExportRapportDialog } from '@/features/rapport/components/ExportRapportDialog'
import { useRapportCours } from '@/features/rapport/hooks/useRapportCours'
import { NOTATION_PAR_DEFAUT } from '@/shared/lib/rapport'
import { useSessionActive } from '@/features/sessions/hooks/useSessions'
import { construireRapport, type SeanceRapport } from '@/shared/lib/rapportSession'
import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'
import type { Session } from '@/shared/supabase/sessionRepo'

vi.mock('@/features/rapport/hooks/useRapportCours', () => ({ useRapportCours: vi.fn() }))
// Le dialogue pré-remplit son en-tête depuis la session du cours : ce fichier
// teste la période et les mentions, pas la résolution de session.
vi.mock('@/features/sessions/hooks/useSessions', () => ({ useSessionActive: vi.fn() }))

const useRapportMock = vi.mocked(useRapportCours)
const useSessionActiveMock = vi.mocked(useSessionActive)

function session(nom: string, date_debut: string, date_fin: string | null): Session {
  return {
    id: 'session-1',
    centre_id: 'centre-1',
    nom,
    date_debut,
    date_fin,
    statut: 'en_cours',
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
  }
}

function simulerSessions(sessions: Session[]) {
  useSessionActiveMock.mockReturnValue({
    session: sessions[0] ?? null,
    sessionId: sessions[0]?.id,
    sessions,
    chargement: false,
    erreur: null,
    choisir: vi.fn(),
    plusieurs: sessions.length > 1,
  })
}

/** Un cours minimal : seuls `session_id` et `niveau` comptent ici. */
function cours(niveau: string | null): CoursAvecDetails {
  return {
    id: 'c1',
    centre_id: 'centre-1',
    enseignant_id: null,
    libelle: 'Coran',
    type_cours_id: 'type-1',
    session_id: 'session-1',
    niveau,
    format: 'groupe',
    date_debut: '2026-03-01',
    date_fin: null,
    lien_meet: null,
    jeton_partage: null,
    logo: null,
    assiduite_active: null,
    base_academique: null,
    bareme_assiduite: null,
    penalite_absence: null,
    penalite_retard: null,
    penaliser_absences_excusees: null,
    statut: 'actif',
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
    type_cours: { libelle: 'Mémorisation' },
    inscription: [{ count: 1 }],
    creneau: [],
    tarif: [],
  }
}

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
    simulerSessions([])
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

/**
 * Le rapport se rattache à la VRAIE session (migration 0022) : son nom, le
 * niveau du cours et sa période sont proposés, plutôt que retapés à chaque
 * export. Ce sont des propositions — tout reste modifiable.
 */
describe('ExportRapportDialog — pré-remplissage depuis la session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    brancherHook()
  })

  it('propose le nom de la session et le niveau du cours', () => {
    simulerSessions([session('Session 17', '2026-03-01', '2026-06-30')])

    render(
      <ExportRapportDialog coursId="c1" ouvert onOuvertChange={vi.fn()} cours={cours('Niveau 2')} />
    )

    expect(screen.getByLabelText('Session')).toHaveValue('Session 17')
    expect(screen.getByLabelText('Niveau')).toHaveValue('Niveau 2')
  })

  it('cale la période sur les dates de la session', () => {
    simulerSessions([session('Session 17', '2026-03-01', '2026-06-30')])

    render(
      <ExportRapportDialog coursId="c1" ouvert onOuvertChange={vi.fn()} cours={cours(null)} />
    )

    expect(screen.getByLabelText('Limiter à une plage de dates')).toBeChecked()
    expect(screen.getByLabelText('Du')).toHaveValue('2026-03-01')
    expect(screen.getByLabelText('Au')).toHaveValue('2026-06-30')
  })

  /*
   * ⚠️ Une session perpétuelle n'a pas de fin. Cocher « limiter à une plage »
   * avec une borne vide ne retiendrait RIEN — un rapport vide, découvert à
   * l'impression.
   */
  it('ne limite pas la période quand la session n’a pas de date de fin', () => {
    simulerSessions([session('Session en cours', '2026-03-01', null)])

    render(
      <ExportRapportDialog coursId="c1" ouvert onOuvertChange={vi.fn()} cours={cours(null)} />
    )

    expect(screen.getByLabelText('Limiter à une plage de dates')).not.toBeChecked()
    expect(screen.queryByLabelText('Du')).not.toBeInTheDocument()
  })

  it('reste modifiable : ce sont des propositions', async () => {
    const utilisateur = userEvent.setup()
    simulerSessions([session('Session 17', '2026-03-01', '2026-06-30')])

    render(
      <ExportRapportDialog coursId="c1" ouvert onOuvertChange={vi.fn()} cours={cours('Niveau 2')} />
    )

    await utilisateur.clear(screen.getByLabelText('Niveau'))
    expect(screen.getByLabelText('Niveau')).toHaveValue('')

    // Et le champ vidé le RESTE : aucun effet ne vient le réécrire.
    await utilisateur.type(screen.getByLabelText('Session'), ' bis')
    expect(screen.getByLabelText('Niveau')).toHaveValue('')
    expect(screen.getByLabelText('Session')).toHaveValue('Session 17 bis')
  })

  it('ne propose rien quand le cours n’est pas fourni', () => {
    simulerSessions([session('Session 17', '2026-03-01', '2026-06-30')])

    render(<ExportRapportDialog coursId="c1" ouvert onOuvertChange={vi.fn()} />)

    expect(screen.getByLabelText('Session')).toHaveValue('')
    expect(screen.getByLabelText('Limiter à une plage de dates')).not.toBeChecked()
  })
})
