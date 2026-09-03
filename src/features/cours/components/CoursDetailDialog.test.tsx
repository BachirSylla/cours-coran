import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CoursDetailDialog } from '@/features/cours/components/CoursDetailDialog'
import { useMembre } from '@/features/membres/hooks/useMembre'
import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'

/**
 * Le renversement du lot 0017 se voit ici mieux que partout ailleurs : deux
 * autorités distinctes, qui ne se recouvrent pas.
 *
 * Les sections sont remplacées par des témoins — ce qui est vérifié est **ce
 * que le dialogue montre**, pas ce que chaque section affiche. Leur contenu a
 * ses propres tests, et la frontière réelle est de toute façon dans les
 * policies (`supabase/tests/rls_etancheite.sql`).
 */
vi.mock('@/features/membres/hooks/useMembre', () => ({ useMembre: vi.fn() }))

vi.mock('@/features/inscriptions/components/SectionInscriptions', () => ({
  SectionInscriptions: ({ lectureSeule }: { lectureSeule?: boolean }) => (
    <div>Inscriptions{lectureSeule ? ' (lecture seule)' : ' (modifiables)'}</div>
  ),
}))
vi.mock('@/features/partage/components/SectionPartage', () => ({
  SectionPartage: () => <div>Partage</div>,
}))
vi.mock('@/features/inscriptions/components/SectionExamen', () => ({
  SectionExamen: () => <div>Examen</div>,
}))
vi.mock('@/features/inscriptions/components/SectionSuiviApprenant', () => ({
  SectionSuiviApprenant: () => <div>Suivi de l'apprenant</div>,
}))
vi.mock('@/features/cours/components/SectionReglagesCours', () => ({
  SectionReglagesCours: () => <div>Réglages spécifiques</div>,
}))
vi.mock('@/features/cours/components/SectionVisio', () => ({
  SectionVisio: () => <div>Section visio</div>,
}))
vi.mock('@/features/paiements/components/SectionPaiements', () => ({
  SectionPaiements: () => <div>Règlements</div>,
}))
vi.mock('@/features/seances/components/SeancesRecentesCours', () => ({
  SeancesRecentesCours: () => <div>Séances récentes</div>,
}))
vi.mock('@/features/seances/components/SeanceFormDialog', () => ({
  SeanceFormDialog: () => null,
}))
vi.mock('@/features/rapport/components/ExportRapportDialog', () => ({
  ExportRapportDialog: () => null,
}))

const useMembreMock = vi.mocked(useMembre)

const MOI = 'user-moi'
const AUTRE = 'user-autre'

function membre(role: 'responsable' | 'enseignant') {
  return {
    membre: null,
    userId: MOI,
    centreId: 'centre-1',
    role,
    estResponsable: role === 'responsable',
    chargement: false,
  }
}

function cours(enseignantId: string | null): CoursAvecDetails {
  return {
    id: 'c1',
    centre_id: 'centre-1',
    enseignant_id: enseignantId,
    libelle: 'Groupe Hifz',
    type_cours_id: 'type-1',
    format: 'groupe',
    date_debut: '2026-07-01',
    date_fin: null,
    lien_meet: 'https://meet.google.com/abc-defg-hij',
    jeton_partage: null,
    session_id: 'session-1',
    niveau: null,
    reconduit_de: null,
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
    inscription: [{ count: 2 }],
    creneau: [],
    tarif: [{ prix_mensuel: 15000, devise: 'XOF' }],
  }
}

function afficher(enseignantId: string | null) {
  render(
    <CoursDetailDialog
      cours={cours(enseignantId)}
      onOuvertChange={vi.fn()}
      onModifier={vi.fn()}
    />
  )
}

const PEDAGOGIE = [
  'Section visio',
  'Partage',
  'Examen',
  "Suivi de l'apprenant",
  'Réglages spécifiques',
]

describe('CoursDetailDialog — structure contre pédagogie', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('donne les deux moitiés au responsable qui enseigne le cours', () => {
    // C'est la situation du compte solo : responsable ET enseignant. Il doit
    // tout voir, exactement comme avant le lot 0017.
    useMembreMock.mockReturnValue(membre('responsable'))

    afficher(MOI)

    for (const bloc of PEDAGOGIE) {
      expect(screen.getByText(bloc), bloc).toBeInTheDocument()
    }
    expect(screen.getByText('Règlements')).toBeInTheDocument()
    expect(screen.getByText(/15000 XOF/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Modifier le cours/ })).toBeInTheDocument()
    expect(screen.getByText('Inscriptions (modifiables)')).toBeInTheDocument()
  })

  it('ne laisse que la structure au responsable qui n’enseigne pas ce cours', () => {
    // Le renversement : il gère le cours, il ne l'anime pas. La RLS le lui
    // refuse désormais — lui montrer les commandes serait mentir.
    useMembreMock.mockReturnValue(membre('responsable'))

    afficher(AUTRE)

    for (const bloc of PEDAGOGIE) {
      expect(screen.queryByText(bloc), bloc).not.toBeInTheDocument()
    }
    expect(screen.getByText('Règlements')).toBeInTheDocument()
    expect(screen.getByText(/15000 XOF/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Modifier le cours/ })).toBeInTheDocument()
  })

  it('donne la pédagogie à l’enseignant du cours, et rien de la structure', () => {
    useMembreMock.mockReturnValue(membre('enseignant'))

    afficher(MOI)

    for (const bloc of PEDAGOGIE) {
      expect(screen.getByText(bloc), bloc).toBeInTheDocument()
    }
    expect(screen.queryByText('Règlements')).not.toBeInTheDocument()
    expect(screen.queryByText(/15000/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Modifier le cours/ })).not.toBeInTheDocument()
    expect(screen.getByText('Inscriptions (lecture seule)')).toBeInTheDocument()
  })

  it('ne montre rien à un enseignant sur le cours d’un collègue', () => {
    useMembreMock.mockReturnValue(membre('enseignant'))

    afficher(AUTRE)

    for (const bloc of PEDAGOGIE) {
      expect(screen.queryByText(bloc), bloc).not.toBeInTheDocument()
    }
    expect(screen.queryByText('Règlements')).not.toBeInTheDocument()
  })

  it('laisse le rapport à tout le monde — la lecture ne se resserre pas', () => {
    // Le rapport est une lecture, et un responsable doit pouvoir le sortir pour
    // n'importe quel cours de son centre.
    useMembreMock.mockReturnValue(membre('responsable'))
    afficher(AUTRE)
    expect(screen.getByRole('button', { name: /Exporter le rapport/ })).toBeInTheDocument()

    vi.clearAllMocks()
    useMembreMock.mockReturnValue(membre('enseignant'))
    afficher(MOI)
    expect(screen.getAllByRole('button', { name: /Exporter le rapport/ })).not.toHaveLength(0)
  })

  it('affiche le lien visio en lecture à qui ne l’édite pas', () => {
    // L'enseignant a la section complète ; les autres gardent le lien visible,
    // parce que savoir où se tient le cours n'est pas un droit d'écriture.
    useMembreMock.mockReturnValue(membre('responsable'))

    afficher(AUTRE)

    expect(screen.getByText('Visioconférence')).toBeInTheDocument()
    expect(screen.queryByText('Section visio')).not.toBeInTheDocument()
  })
})
