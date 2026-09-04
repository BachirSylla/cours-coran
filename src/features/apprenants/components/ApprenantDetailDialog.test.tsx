import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'

import { ApprenantDetailDialog } from '@/features/apprenants/components/ApprenantDetailDialog'
import { useInscriptionsApprenant } from '@/features/inscriptions/hooks/useInscriptionsApprenant'
import type { Apprenant } from '@/shared/supabase/apprenantRepo'
import type {
  InscriptionAvecCours,
  SessionDuCours,
} from '@/shared/supabase/inscriptionRepo'
import { SESSION_TERMINEE } from '@/shared/supabase/sessionRepo'
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
  centre_id: 'centre-1',
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

const SESSION_COURANTE: SessionDuCours = {
  id: 'session-1',
  nom: 'Session 17',
  date_debut: '2026-07-01',
  date_fin: null,
  statut: 'en_cours',
}

function inscription(
  id: string,
  libelleCours: string,
  session: SessionDuCours | null = SESSION_COURANTE
): InscriptionAvecCours {
  return {
    id,
    centre_id: 'centre-1',
    apprenant_id: 'a1',
    cours_id: `cours-${id}`,
    note_examen: null,
    examen_bareme: null,
    jeton: null,
    created_at: '2026-07-27T10:00:00Z',
    updated_at: '2026-07-27T10:00:00Z',
    cours: {
      id: `cours-${id}`,
      centre_id: 'centre-1',
      libelle: libelleCours,
      type_cours_id: 'type-1',
      reconduit_de: null,
      format: 'groupe',
      date_debut: '2026-07-27',
      date_fin: null,
      lien_meet: null,
      jeton_partage: null,
      session_id: 'session-1',
      niveau: null,
      enseignant_id: null,
      logo: null,
      assiduite_active: null,
      base_academique: null,
      bareme_assiduite: null,
      penalite_absence: null,
      penalite_retard: null,
      penaliser_absences_excusees: null,
      statut: 'actif',
      created_at: '2026-07-27T10:00:00Z',
      updated_at: '2026-07-27T10:00:00Z',
      type_cours: { libelle: 'Mémorisation' },
      session,
      creneau: [
        {
          id: `cr-${id}`,
          centre_id: 'centre-1',
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

  /** Le rendu nominal, pour les cas du parcours qui ne varient que par les données. */
  function rendre() {
    return rendreAvecQuery(
      <ApprenantDetailDialog
        apprenant={APPRENANT}
        onOuvertChange={vi.fn()}
        onModifier={vi.fn()}
      />
    )
  }

  /*
   * ================== LE PARCOURS À TRAVERS LES SESSIONS (0025) ==================
   *
   * Sans en-tête de session, « Coran niveau 1 » et « Coran niveau 2 » se lisent
   * comme deux cours suivis en même temps. C'est le regroupement, et lui seul,
   * qui transforme une liste en progression.
   */
  /*
   * ⚠️ `SESSION_TERMINEE`, jamais un littéral. La contrainte de la base n'accepte
   * que `en_cours` et `terminee` ; un « cloturee » écrit à la main compilait —
   * `statut` est typé `string` — et rendait le marqueur de l'écran inatteignable,
   * avec ce test vert par-dessus.
   */
  const SESSION_PASSEE: SessionDuCours = {
    id: 'session-16',
    nom: 'Session 16',
    date_debut: '2026-01-05',
    date_fin: '2026-06-30',
    statut: SESSION_TERMINEE,
  }

  it('regroupe les cours par session, de la plus récente à la plus ancienne', () => {
    // L'ordre vient du repository : il est préservé tel quel.
    simuler({
      data: [
        inscription('i1', 'Coran niveau 2'),
        inscription('i2', 'Coran niveau 1', SESSION_PASSEE),
      ],
    })
    rendre()

    const contenu = screen.getByRole('dialog').textContent ?? ''
    expect(contenu.indexOf('Session 17')).toBeLessThan(contenu.indexOf('Session 16'))
    expect(contenu.indexOf('Coran niveau 2')).toBeLessThan(contenu.indexOf('Coran niveau 1'))
  })

  it('signale une session terminée', () => {
    simuler({ data: [inscription('i2', 'Coran niveau 1', SESSION_PASSEE)] })
    rendre()

    expect(screen.getByText(/terminée/)).toBeInTheDocument()
  })

  it('ne marque pas une session en cours', () => {
    simuler({ data: [inscription('i1', 'Coran niveau 2')] })
    rendre()

    expect(screen.queryByText(/terminée/)).not.toBeInTheDocument()
  })

  it('réunit sous un seul en-tête deux cours de la même session', () => {
    simuler({
      data: [inscription('i1', 'Coran matin'), inscription('i2', 'Tadjwîd soir')],
    })
    rendre()

    expect(screen.getAllByText('Session 17')).toHaveLength(1)
    expect(screen.getByText('Coran matin')).toBeInTheDocument()
    expect(screen.getByText('Tadjwîd soir')).toBeInTheDocument()
  })

  /*
   * Repli DÉFENSIF, et rien de plus : la policy `inscription_select` porte sur
   * `cours_lisibles()`, donc elle écarte la LIGNE entière — un embed vide ne
   * remonte jamais de ce chemin, et ce test ne prouve donc rien sur la RLS. Il
   * fige seulement que le type de PostgREST autorise `null`, et qu'on préfère
   * l'écrire plutôt que d'afficher « undefined ».
   */
  it('affiche un repli lisible plutôt qu’un vide si le cours manque', () => {
    const opaque = { ...inscription('i3', 'peu importe'), cours: null }
    simuler({ data: [inscription('i1', 'Coran niveau 2'), opaque] })
    rendre()

    expect(screen.getByText('Cours non lisible')).toBeInTheDocument()
    expect(screen.getByText('Session non lisible')).toBeInTheDocument()
    expect(screen.getByText('(2)')).toBeInTheDocument()
  })
})
