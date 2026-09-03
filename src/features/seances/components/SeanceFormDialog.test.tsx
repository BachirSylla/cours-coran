import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SeanceFormDialog } from '@/features/seances/components/SeanceFormDialog'
import { useEnregistrerSeance } from '@/features/seances/hooks/useEnregistrerSeance'
import { useSeancesCours } from '@/features/seances/hooks/useSeancesCours'
import { useSessionActive } from '@/features/sessions/hooks/useSessions'
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
/**
 * Même parti pris pour le bloc de remplacement : ce qui est vérifié ici est
 * LEQUEL des deux est monté, et avec quel motif de refus. Le contenu du bloc a
 * son propre fichier.
 */
vi.mock('@/features/seances/components/BlocPresenceIndisponible', () => ({
  BlocPresenceIndisponible: ({ refus }: { refus: string }) => (
    <div data-testid="presence-indisponible" data-refus={refus}>
      Présence indisponible
    </div>
  ),
}))
vi.mock('@/features/seances/hooks/useEnregistrerSeance', () => ({
  useEnregistrerSeance: vi.fn(),
}))
vi.mock('@/features/seances/hooks/useSeancesCours', () => ({ useSeancesCours: vi.fn() }))
vi.mock('@/features/sessions/hooks/useSessions', () => ({ useSessionActive: vi.fn() }))

const useEnregistrerMock = vi.mocked(useEnregistrerSeance)
const useSeancesCoursMock = vi.mocked(useSeancesCours)
const useSessionActiveMock = vi.mocked(useSessionActive)

/** Sessions du centre. Par défaut une seule, ouverte : le cas ordinaire. */
function simulerSessions(statut: 'en_cours' | 'terminee' = 'en_cours') {
  const session = {
    id: 'session-1',
    centre_id: 'centre-1',
    nom: 'Session 17',
    date_debut: '2026-01-05',
    date_fin: null,
    statut,
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
  }

  useSessionActiveMock.mockReturnValue({
    session,
    sessionId: session.id,
    sessions: [session],
    chargement: false,
    erreur: null,
    choisir: vi.fn(),
    plusieurs: false,
  })
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
    enseignant_id: null,
    session_id: 'session-1',
    ...options,
  }
}

function seance(options: Record<string, unknown> = {}) {
  return {
    id: 'seance-1',
    centre_id: 'centre-1',
    cours_id: 'cours-1',
    date: '2026-07-27',
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
  } as SeanceVueEnrichie['seance']
}

describe('SeanceFormDialog — section d’évaluation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    simulerSessions()
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

/**
 * Une présence n'a de sens que sur une séance qui a eu lieu.
 *
 * Deux raisons de ne pas la proposer, et elles ne se traitent pas au même
 * endroit : le STATUT est un invariant que la base fait respecter (migration
 * 0020) ; la DATE est une garde de bon sens qui vit ici seulement, parce que
 * « aujourd'hui » est celui du navigateur, pas celui du serveur.
 */
describe('SeanceFormDialog — présence réservée aux séances faites', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    simulerSessions()
    vi.useFakeTimers()
    // Mercredi 27 juillet 2026 : la date des fixtures est ce jour-là, donc
    // « aujourd'hui » par défaut. Les tests décalent ce qu'ils veulent tester.
    vi.setSystemTime(new Date(2026, 6, 27, 12, 0))
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

  afterEach(() => {
    vi.useRealTimers()
  })

  it('propose la présence sur une séance faite dont le jour est arrivé', () => {
    render(<SeanceFormDialog vue={vue()} onOuvertChange={vi.fn()} />)

    expect(screen.getByTestId('section-presence')).toBeInTheDocument()
    expect(screen.queryByTestId('presence-indisponible')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Motif')).not.toBeInTheDocument()
  })

  it.each(['annulee', 'reportee', 'absence'])(
    'remplace la présence par le motif quand la séance est « %s »',
    (statut) => {
      render(<SeanceFormDialog vue={vue({ seance: seance({ statut }) })} onOuvertChange={vi.fn()} />)

      expect(screen.queryByTestId('section-presence')).not.toBeInTheDocument()
      expect(screen.getByTestId('presence-indisponible')).toHaveAttribute('data-refus', 'statut')
      expect(screen.getByLabelText('Motif')).toBeInTheDocument()
    }
  )

  it('réaffiche le motif déjà enregistré', () => {
    render(
      <SeanceFormDialog
        vue={vue({ seance: seance({ statut: 'annulee', motif: 'Enseignant souffrant.' }) })}
        onOuvertChange={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Motif')).toHaveValue('Enseignant souffrant.')
  })

  /*
   * Le piège que ce lot referme : `seance.statut` naît « faite » — en base comme
   * dans le formulaire. Une séance générée pour la semaine prochaine est donc
   * « faite » sans que personne l'ait décidé, et proposait un pointage.
   */
  it('ne propose pas la présence sur une séance qui n’a pas encore eu lieu', () => {
    vi.setSystemTime(new Date(2026, 6, 20, 12, 0)) // une semaine plus tôt

    render(<SeanceFormDialog vue={vue()} onOuvertChange={vi.fn()} />)

    expect(screen.queryByTestId('section-presence')).not.toBeInTheDocument()
    expect(screen.getByTestId('presence-indisponible')).toHaveAttribute('data-refus', 'date')
    // Pas de motif : la séance n'a rien à expliquer, elle n'a pas encore eu lieu.
    expect(screen.queryByLabelText('Motif')).not.toBeInTheDocument()
  })

  /*
   * Tout le reste du formulaire décrit ce qui s'est PASSÉ. Sur une séance qui
   * n'a pas eu lieu, ces champs demanderaient de décrire le néant.
   */
  it('ne laisse que le motif quand la séance n’a pas eu lieu', () => {
    render(
      <SeanceFormDialog
        vue={vue({ seance: seance({ statut: 'annulee' }) })}
        onOuvertChange={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Motif')).toBeInTheDocument()
    expect(screen.getByLabelText('Statut')).toBeInTheDocument()

    expect(screen.queryByLabelText('Contenu abordé')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Exercices à faire')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Observations')).not.toBeInTheDocument()
    expect(screen.queryByText('Détails Coran (optionnel)')).not.toBeInTheDocument()
  })

  it('ne rappelle pas les exercices de la fois d’avant sur une séance annulée', () => {
    useSeancesCoursMock.mockReturnValue({
      data: [
        {
          id: 's0',
          cours_id: 'cours-1',
          date: '2026-07-20',
          heure_debut: '10:00:00',
          heure_fin: '11:00:00',
          statut: 'faite',
          exercices_a_faire: 'Réviser 1 à 20',
        },
      ],
    } as unknown as ReturnType<typeof useSeancesCours>)

    render(
      <SeanceFormDialog
        vue={vue({ seance: seance({ statut: 'annulee' }) })}
        onOuvertChange={vi.fn()}
      />
    )

    expect(screen.queryByText('Exercices donnés la dernière fois')).not.toBeInTheDocument()
  })

  /*
   * ⚠️ MASQUER N'EST PAS EFFACER.
   *
   * React Hook Form conserve la valeur des champs démontés — c'est son défaut
   * (`shouldUnregister: false`), donc un comportement de bibliothèque, pas une
   * propriété de notre code. Le passer à `true` un jour viderait silencieusement
   * quatre colonnes de toute séance passée en annulée. Ce test est là pour que
   * ce changement ne puisse pas être silencieux.
   */
  it('n’efface pas le contenu déjà saisi en le masquant', async () => {
    // Timers réels : `waitFor` ne progresse pas sous faux timers. Sans effet ici,
    // le refus tenant au statut et non à la date.
    vi.useRealTimers()

    const enregistrer = vi.fn().mockResolvedValue({ id: 'seance-1' })
    useEnregistrerMock.mockReturnValue({
      mutateAsync: enregistrer,
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
    } as unknown as ReturnType<typeof useEnregistrerSeance>)

    render(
      <SeanceFormDialog
        vue={vue({
          seance: seance({
            statut: 'annulee',
            contenu_aborde: 'Al-Fatiha travaillée',
            exercices_a_faire: 'Réviser la page 72',
            observations: 'Bonne séance',
          }),
        })}
        onOuvertChange={vi.fn()}
      />
    )

    expect(screen.queryByLabelText('Contenu abordé')).not.toBeInTheDocument()

    fireEvent.submit(document.getElementById('formulaire-seance') as HTMLFormElement)

    await waitFor(() => expect(enregistrer).toHaveBeenCalled())
    expect(enregistrer.mock.calls[0]![0]).toMatchObject({
      statut: 'annulee',
      contenu_aborde: 'Al-Fatiha travaillée',
      exercices_a_faire: 'Réviser la page 72',
      observations: 'Bonne séance',
    })
  })

  it('affiche tous les champs pédagogiques sur une séance faite', () => {
    render(<SeanceFormDialog vue={vue()} onOuvertChange={vi.fn()} />)

    expect(screen.getByLabelText('Contenu abordé')).toBeInTheDocument()
    expect(screen.getByLabelText('Exercices à faire')).toBeInTheDocument()
    expect(screen.getByLabelText('Observations')).toBeInTheDocument()
    expect(screen.getByText('Détails Coran (optionnel)')).toBeInTheDocument()
  })

  it('le statut prime sur la date — une séance à venir et annulée dit pourquoi', () => {
    vi.setSystemTime(new Date(2026, 6, 20, 12, 0))

    render(
      <SeanceFormDialog vue={vue({ seance: seance({ statut: 'annulee' }) })} onOuvertChange={vi.fn()} />
    )

    expect(screen.getByTestId('presence-indisponible')).toHaveAttribute('data-refus', 'statut')
    expect(screen.getByLabelText('Motif')).toBeInTheDocument()
  })
})

/**
 * Une session clôturée n'accepte plus ni séance, ni présence, ni note
 * (migration 0023). La base le refuse par trigger ; l'écran ne fait que ne pas
 * tendre un formulaire qui échouerait — et dit pourquoi, plutôt que de
 * disparaître.
 */
describe('SeanceFormDialog — session clôturée', () => {
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

  it('annonce la clôture et dit ce qui reste possible', () => {
    simulerSessions('terminee')

    render(<SeanceFormDialog vue={vue()} onOuvertChange={vi.fn()} />)

    expect(screen.getByText('Session clôturée')).toBeInTheDocument()
    expect(screen.getByText(/Tout reste lisible/)).toBeInTheDocument()
    expect(screen.getByText(/rapport reste téléchargeable/)).toBeInTheDocument()
  })

  it('coupe la saisie : champs inertes, présence retirée, bouton désactivé', () => {
    simulerSessions('terminee')

    render(<SeanceFormDialog vue={vue()} onOuvertChange={vi.fn()} />)

    expect(screen.getByLabelText('Contenu abordé')).toBeDisabled()
    expect(screen.queryByTestId('section-presence')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
  })

  it('ne gêne rien tant que la session est ouverte', () => {
    simulerSessions('en_cours')

    render(<SeanceFormDialog vue={vue()} onOuvertChange={vi.fn()} />)

    expect(screen.queryByText('Session clôturée')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Contenu abordé')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled()
  })
})
