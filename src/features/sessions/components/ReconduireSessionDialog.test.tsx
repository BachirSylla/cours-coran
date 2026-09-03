import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ReconduireSessionDialog } from '@/features/sessions/components/ReconduireSessionDialog'
import { useReconduireSession } from '@/features/sessions/hooks/useSessions'
import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'
import type { Session } from '@/shared/supabase/sessionRepo'

vi.mock('@/features/sessions/hooks/useSessions', () => ({ useReconduireSession: vi.fn() }))

const useReconduireMock = vi.mocked(useReconduireSession)
const reconduire = vi.fn()

const S17: Session = {
  id: 's17',
  centre_id: 'centre-1',
  nom: 'Session 17',
  date_debut: '2026-01-05',
  date_fin: null,
  statut: 'en_cours',
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-01T10:00:00Z',
}

function cours(
  id: string,
  libelle: string,
  session_id: string,
  creneaux: number,
  enseignant_id: string | null = 'ens-1'
): CoursAvecDetails {
  return {
    id,
    centre_id: 'centre-1',
    enseignant_id,
    libelle,
    type_cours_id: 'type-1',
    session_id,
    niveau: 'Niveau 1',
    reconduit_de: null,
    format: 'groupe',
    date_debut: '2026-01-05',
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
    created_at: '2026-01-05T10:00:00Z',
    updated_at: '2026-01-05T10:00:00Z',
    type_cours: { libelle: 'Mémorisation' },
    inscription: [{ count: 3 }],
    creneau: Array.from({ length: creneaux }, (_, index) => ({
      id: `${id}-cr${index}`,
      centre_id: 'centre-1',
      cours_id: id,
      jour_semaine: 1,
      heure_debut: '10:00:00',
      heure_fin: '11:00:00',
      created_at: '2026-01-05T10:00:00Z',
      updated_at: '2026-01-05T10:00:00Z',
    })),
    tarif: [],
  }
}

const COURS = [
  cours('c1', 'Coran Niveau 1', 's17', 2),
  cours('c2', 'Tadjwîd', 's17', 1),
  // D'une autre session : ne doit pas être compté.
  cours('c3', 'Ailleurs', 's16', 3),
]

function mutation(extra: Record<string, unknown> = {}) {
  return {
    mutate: reconduire,
    isPending: false,
    isError: false,
    error: null,
    ...extra,
  } as unknown as ReturnType<typeof useReconduireSession>
}

function rendre(cours = COURS, source: Session | null = S17) {
  return render(
    <ReconduireSessionDialog source={source} cours={cours} onOuvertChange={vi.fn()} />
  )
}

describe('ReconduireSessionDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useReconduireMock.mockReturnValue(mutation())
  })

  it('propose le nom suivant, et laisse le corriger', async () => {
    const utilisateur = userEvent.setup()
    rendre()

    const champ = screen.getByLabelText('Nom de la nouvelle session')
    expect(champ).toHaveValue('Session 18')

    await utilisateur.clear(champ)
    await utilisateur.type(champ, 'Ramadan 2027')
    expect(champ).toHaveValue('Ramadan 2027')
  })

  /*
   * ⚠️ L'écran doit dire EXACTEMENT ce qui suit et ce qui ne suit pas. C'est un
   * geste qui crée d'un coup une dizaine de cours : personne ne doit découvrir
   * après coup que les apprenants n'ont pas été repris.
   */
  it('annonce ce qui sera recopié, compté sur la bonne session', () => {
    rendre()

    expect(screen.getByText('2 cours et 3 créneaux seront recopiés')).toBeInTheDocument()
    expect(screen.getByText(/Libellé, type, niveau, format, enseignant/)).toBeInTheDocument()
  })

  it('annonce surtout ce qui ne sera PAS recopié', () => {
    rendre()

    expect(screen.getByText(/Ne suivent pas :/)).toBeInTheDocument()
    expect(screen.getByText(/apprenants inscrits/)).toBeInTheDocument()
    expect(screen.getByText(/notes et les examens/)).toBeInTheDocument()
    expect(screen.getByText(/lien de partage/)).toBeInTheDocument()
  })

  it('signale les cours sans enseignant, qui le resteront', () => {
    rendre([cours('c1', 'Orphelin', 's17', 1, null), cours('c2', 'Tenu', 's17', 1)])

    expect(screen.getByText(/1 cours est sans enseignant affecté/)).toBeInTheDocument()
  })

  it('prévient quand la session source est vide', () => {
    rendre([cours('c3', 'Ailleurs', 's16', 1)])

    expect(screen.getByText(/ne contient aucun cours/)).toBeInTheDocument()
    expect(screen.queryByText(/seront recopiés/)).not.toBeInTheDocument()
  })

  /*
   * La date de début est CHOISIE : entre deux sessions il y a souvent des
   * vacances, et imposer la continuité obligerait à corriger chaque fois.
   */
  it('laisse choisir la date de début, et dit qu’un écart est permis', async () => {
    const utilisateur = userEvent.setup()
    rendre()

    expect(screen.getByText(/des vacances entre les deux sont permises/)).toBeInTheDocument()

    await utilisateur.type(screen.getByLabelText('Date de début'), '2026-09-01')
    await utilisateur.click(screen.getByRole('button', { name: /Ouvrir la session/ }))

    expect(reconduire).toHaveBeenCalledWith(
      {
        sessionSourceId: 's17',
        nom: 'Session 18',
        dateDebut: '2026-09-01',
        dateFin: null,
      },
      expect.anything()
    )
  })

  it('transmet la date de fin quand elle est renseignée', async () => {
    const utilisateur = userEvent.setup()
    rendre()

    await utilisateur.type(screen.getByLabelText('Date de début'), '2026-09-01')
    await utilisateur.type(screen.getByLabelText(/Date de fin/), '2027-01-31')
    await utilisateur.click(screen.getByRole('button', { name: /Ouvrir la session/ }))

    expect(reconduire).toHaveBeenCalledWith(
      expect.objectContaining({ dateFin: '2027-01-31' }),
      expect.anything()
    )
  })

  it('rappelle que la session source n’est pas modifiée', () => {
    rendre()

    expect(screen.getByText(/« Session 17 » n'est pas modifiée/)).toBeInTheDocument()
  })

  it('remonte le refus de la base sans le maquiller', () => {
    useReconduireMock.mockReturnValue(
      mutation({
        isError: true,
        error: new Error('Une session porte déjà le nom « Session 18 » dans ce centre.'),
      })
    )
    rendre()

    expect(screen.getByText(/porte déjà le nom/)).toBeInTheDocument()
  })

  it('ne rend rien tant qu’aucune session n’est choisie', () => {
    const { container } = rendre(COURS, null)

    expect(container).toBeEmptyDOMElement()
  })
})

/**
 * Le nom proposé n'est qu'une proposition — et quand il n'y a rien à proposer,
 * le champ reste vide. « Session en cours » est le nom que le backfill de 0022
 * donne à tout centre : c'est donc le cas de la PREMIÈRE reconduction.
 */
describe('ReconduireSessionDialog — nom sans numéro', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useReconduireMock.mockReturnValue(mutation())
  })

  it('laisse le champ vide plutôt que de proposer un nom absurde', () => {
    rendre(COURS, { ...S17, nom: 'Session en cours' })

    expect(screen.getByLabelText('Nom de la nouvelle session')).toHaveValue('')
    expect(screen.getByLabelText('Nom de la nouvelle session')).toBeRequired()
  })
})
