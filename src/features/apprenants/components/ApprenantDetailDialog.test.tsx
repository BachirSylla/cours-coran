import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'

import { ApprenantDetailDialog } from '@/features/apprenants/components/ApprenantDetailDialog'
import { useInscriptionsApprenant } from '@/features/inscriptions/hooks/useInscriptionsApprenant'
import type { Apprenant } from '@/shared/supabase/apprenantRepo'
import type { InscriptionAvecCours } from '@/shared/supabase/inscriptionRepo'
import { rendreAvecQuery } from '@/test/rendreAvecQuery'

vi.mock('@/features/inscriptions/hooks/useInscriptionsApprenant', () => ({
  useInscriptionsApprenant: vi.fn(),
}))
// La progression a ses propres tests : ici on vérifie la fiche elle-même.
vi.mock('@/features/apprenants/hooks/useProgressionApprenant', () => ({
  useProgressionApprenant: () => ({
    progressions: [],
    seancesRecentes: [],
    isPending: false,
    isError: false,
    error: null,
  }),
}))

const useInscriptionsMock = vi.mocked(useInscriptionsApprenant)

const APPRENANT: Apprenant = {
  id: 'a1',
  owner_id: 'proprietaire',
  nom: 'Diallo',
  prenom: 'Aïcha',
  contact: '+224 600 00 00 00',
  niveau: 'Qaïda',
  notes: null,
  date_inscription: '2026-07-27',
  statut: 'actif',
  created_at: '2026-07-27T10:00:00Z',
  updated_at: '2026-07-27T10:00:00Z',
}

function inscription(id: string, libelleCours: string): InscriptionAvecCours {
  return {
    id,
    owner_id: 'proprietaire',
    apprenant_id: 'a1',
    cours_id: `cours-${id}`,
    note_examen: null,
    examen_bareme: null,
    created_at: '2026-07-27T10:00:00Z',
    updated_at: '2026-07-27T10:00:00Z',
    cours: {
      id: `cours-${id}`,
      owner_id: 'proprietaire',
      libelle: libelleCours,
      type_cours_id: 'type-1',
      format: 'groupe',
      date_debut: '2026-07-27',
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
      prix_mensuel: null,
      devise: 'XOF',
      statut: 'actif',
      created_at: '2026-07-27T10:00:00Z',
      updated_at: '2026-07-27T10:00:00Z',
      type_cours: { libelle: 'Mémorisation' },
      creneau: [
        {
          id: `cr-${id}`,
          owner_id: 'proprietaire',
          cours_id: `cours-${id}`,
          jour_semaine: 1,
          heure_debut: '10:00:00',
          heure_fin: '11:00:00',
          created_at: '2026-07-27T10:00:00Z',
          updated_at: '2026-07-27T10:00:00Z',
        },
      ],
    },
  }
}

function simuler(etat: Partial<UseQueryResult<InscriptionAvecCours[], Error>>) {
  useInscriptionsMock.mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
    error: null,
    ...etat,
  } as UseQueryResult<InscriptionAvecCours[], Error>)
}

describe('ApprenantDetailDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche la fiche et les cours suivis', () => {
    simuler({ data: [inscription('1', 'Groupe Hifz'), inscription('2', 'Lecture du matin')] })

    rendreAvecQuery(
      <ApprenantDetailDialog
        apprenant={APPRENANT}
        onOuvertChange={vi.fn()}
        onModifier={vi.fn()}
      />
    )

    expect(screen.getByRole('heading', { name: 'Aïcha Diallo' })).toBeInTheDocument()
    expect(screen.getByText('+224 600 00 00 00')).toBeInTheDocument()
    expect(screen.getByText('Groupe Hifz')).toBeInTheDocument()
    expect(screen.getByText('Lecture du matin')).toBeInTheDocument()
    expect(screen.getByText('(2)')).toBeInTheDocument()
    expect(screen.getAllByText('Lun 10:00–11:00')).toHaveLength(2)
  })

  it('affiche un état vide quand l’apprenant ne suit aucun cours', () => {
    simuler({ data: [] })

    rendreAvecQuery(
      <ApprenantDetailDialog
        apprenant={APPRENANT}
        onOuvertChange={vi.fn()}
        onModifier={vi.fn()}
      />
    )

    expect(screen.getByText("Cet apprenant n'est inscrit à aucun cours.")).toBeInTheDocument()
  })

  it('ne rend rien tant qu’aucun apprenant n’est sélectionné', () => {
    simuler({ data: [] })

    rendreAvecQuery(
      <ApprenantDetailDialog apprenant={null} onOuvertChange={vi.fn()} onModifier={vi.fn()} />
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
