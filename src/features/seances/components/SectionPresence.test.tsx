import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'

import { useInscriptionsCours } from '@/features/inscriptions/hooks/useInscriptionsCours'
import { SectionPresence } from '@/features/seances/components/SectionPresence'
import { useParametres } from '@/features/parametres/hooks/useParametres'
import { useDefinirPresence } from '@/features/seances/hooks/useDefinirPresence'
import { useNoterApprenant } from '@/features/seances/hooks/useNoterApprenant'
import { usePresences } from '@/features/seances/hooks/usePresences'
import type { Apprenant } from '@/shared/supabase/apprenantRepo'
import type { InscriptionAvecApprenant } from '@/shared/supabase/inscriptionRepo'
import type { PresenceAvecApprenant } from '@/shared/supabase/presenceRepo'

vi.mock('@/features/inscriptions/hooks/useInscriptionsCours', () => ({
  useInscriptionsCours: vi.fn(),
}))
vi.mock('@/features/seances/hooks/usePresences', () => ({ usePresences: vi.fn() }))
vi.mock('@/features/seances/hooks/useDefinirPresence', () => ({ useDefinirPresence: vi.fn() }))
vi.mock('@/features/parametres/hooks/useParametres', () => ({ useParametres: vi.fn() }))
vi.mock('@/features/seances/hooks/useNoterApprenant', () => ({ useNoterApprenant: vi.fn() }))

const useInscriptionsMock = vi.mocked(useInscriptionsCours)
const usePresencesMock = vi.mocked(usePresences)
const useDefinirMock = vi.mocked(useDefinirPresence)
const useParametresMock = vi.mocked(useParametres)
const useNoterMock = vi.mocked(useNoterApprenant)

const mutate = vi.fn()
const noterAsync = vi.fn()

function apprenant(id: string, prenom: string, nom: string): Apprenant {
  return {
    id,
    owner_id: 'proprietaire',
    nom,
    prenom,
    contact: null,
    niveau: null,
    notes: null,
    date_inscription: '2026-07-27',
    statut: 'actif',
    created_at: '2026-07-27T10:00:00Z',
    updated_at: '2026-07-27T10:00:00Z',
  }
}

const AICHA = apprenant('a1', 'Aïcha', 'Diallo')
const MOUSSA = apprenant('a2', 'Moussa', 'Camara')

function inscription(id: string, personne: Apprenant): InscriptionAvecApprenant {
  return {
    id,
    owner_id: 'proprietaire',
    apprenant_id: personne.id,
    cours_id: 'cours-1',
    note_examen: null,
    examen_bareme: null,
    created_at: '2026-07-27T10:00:00Z',
    updated_at: '2026-07-27T10:00:00Z',
    apprenant: personne,
  }
}

function presence(apprenantId: string, present: boolean): PresenceAvecApprenant {
  return {
    id: `p-${apprenantId}`,
    owner_id: 'proprietaire',
    seance_id: 'seance-1',
    apprenant_id: apprenantId,
    present,
    // `null` : ces fixtures représentent des lignes d'avant la migration 0008,
    // celles qui font justement retomber le comptage sur le booléen.
    etat: null,
    note: null,
    note_bareme: null,
    commentaire: null,
    passage_evalue: null,
    created_at: '2026-07-27T10:00:00Z',
    updated_at: '2026-07-27T10:00:00Z',
    apprenant: null,
  }
}

function requete<T>(donnees: T, etat: Record<string, unknown> = {}) {
  return {
    data: donnees,
    isPending: false,
    isError: false,
    error: null,
    ...etat,
  } as UseQueryResult<T, Error>
}

describe('SectionPresence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useParametresMock.mockReturnValue({
      data: { note_bareme: 20, enregistres: true },
    } as ReturnType<typeof useParametres>)
    useNoterMock.mockReturnValue({
      mutateAsync: noterAsync,
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
    } as unknown as ReturnType<typeof useNoterApprenant>)
    useInscriptionsMock.mockReturnValue(
      requete([inscription('i1', AICHA), inscription('i2', MOUSSA)])
    )
    usePresencesMock.mockReturnValue(requete([]))
    useDefinirMock.mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useDefinirPresence>)
  })

  it('désactive les cases tant que la séance n’est pas enregistrée, en l’expliquant', () => {
    render(<SectionPresence coursId="cours-1" seanceId={undefined} />)

    expect(
      screen.getByText('Enregistrez la séance pour noter les présences.')
    ).toBeInTheDocument()
    for (const case_ of screen.getAllByRole('checkbox')) {
      expect(case_).toBeDisabled()
    }
  })

  it('active les cases une fois la séance enregistrée', () => {
    render(<SectionPresence coursId="cours-1" seanceId="seance-1" />)

    expect(
      screen.queryByText('Enregistrez la séance pour noter les présences.')
    ).not.toBeInTheDocument()
    for (const case_ of screen.getAllByRole('checkbox')) {
      expect(case_).toBeEnabled()
    }
  })

  /** Le sélecteur d'état d'un apprenant, interrogé par son libellé. */
  function selecteurEtat(nom: string) {
    return screen.getByRole('combobox', { name: `État de présence de ${nom}` })
  }

  it('considère un apprenant sans ligne de présence comme présent', () => {
    render(<SectionPresence coursId="cours-1" seanceId="seance-1" />)

    expect(selecteurEtat('Aïcha Diallo')).toHaveValue('present')
    expect(selecteurEtat('Moussa Camara')).toHaveValue('present')
  })

  it('reflète les présences enregistrées', () => {
    usePresencesMock.mockReturnValue(requete([presence('a1', false)]))

    render(<SectionPresence coursId="cours-1" seanceId="seance-1" />)

    // Ligne d'avant la migration 0008 : l'état se déduit du booléen.
    expect(selecteurEtat('Aïcha Diallo')).toHaveValue('absent')
    expect(selecteurEtat('Moussa Camara')).toHaveValue('present')
  })

  it('bascule un apprenant vers absent au décochage', async () => {
    const utilisateur = userEvent.setup()

    render(<SectionPresence coursId="cours-1" seanceId="seance-1" />)

    await utilisateur.click(screen.getByRole('checkbox', { name: /Aïcha Diallo/ }))

    expect(mutate).toHaveBeenCalledWith({
      seanceId: 'seance-1',
      apprenantId: 'a1',
      etat: 'absent',
    })
  })

  it('re-coche un apprenant absent', async () => {
    usePresencesMock.mockReturnValue(requete([presence('a1', false)]))
    const utilisateur = userEvent.setup()

    render(<SectionPresence coursId="cours-1" seanceId="seance-1" />)

    await utilisateur.click(screen.getByRole('checkbox', { name: /Aïcha Diallo/ }))

    expect(mutate).toHaveBeenCalledWith({
      seanceId: 'seance-1',
      apprenantId: 'a1',
      etat: 'present',
    })
  })

  it('enregistre l’état nuancé choisi dans le sélecteur', async () => {
    const utilisateur = userEvent.setup()

    render(<SectionPresence coursId="cours-1" seanceId="seance-1" />)
    await utilisateur.selectOptions(selecteurEtat('Aïcha Diallo'), 'retard')

    expect(mutate).toHaveBeenCalledWith({
      seanceId: 'seance-1',
      apprenantId: 'a1',
      etat: 'retard',
    })
  })

  it('propose les cinq états, y compris l’absence excusée', () => {
    render(<SectionPresence coursId="cours-1" seanceId="seance-1" />)

    const options = within(selecteurEtat('Aïcha Diallo')).getAllByRole('option')

    expect(options.map((option) => option.textContent)).toEqual([
      'Présent',
      'En retard',
      'Absent',
      'Absent (excusé)',
      'Présence partielle',
    ])
  })

  it('affiche l’état enregistré, sans le déduire du booléen', () => {
    usePresencesMock.mockReturnValue(
      requete([{ ...presence('a1', true), etat: 'partiel' as string | null }])
    )

    render(<SectionPresence coursId="cours-1" seanceId="seance-1" />)

    expect(selecteurEtat('Aïcha Diallo')).toHaveValue('partiel')
    // Un apprenant partiellement présent reste compté présent.
    expect(screen.getByRole('checkbox', { name: /Aïcha Diallo/ })).toBeChecked()
  })

  it('désactive aussi le sélecteur tant que la séance n’est pas enregistrée', () => {
    render(<SectionPresence coursId="cours-1" seanceId={undefined} />)

    expect(selecteurEtat('Aïcha Diallo')).toBeDisabled()
  })

  it('affiche un état vide quand le cours n’a aucun inscrit', () => {
    useInscriptionsMock.mockReturnValue(requete([]))

    render(<SectionPresence coursId="cours-1" seanceId="seance-1" />)

    expect(screen.getByText(/Aucun apprenant inscrit à ce cours/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})

describe('SectionPresence — évaluation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useParametresMock.mockReturnValue({
      data: { note_bareme: 20, enregistres: true },
    } as ReturnType<typeof useParametres>)
    useNoterMock.mockReturnValue({
      mutateAsync: noterAsync,
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
    } as unknown as ReturnType<typeof useNoterApprenant>)
    useInscriptionsMock.mockReturnValue({
      data: [inscription('i1', AICHA), inscription('i2', MOUSSA)],
      isPending: false,
    } as UseQueryResult<InscriptionAvecApprenant[], Error>)
  })

  it('affiche les champs d’évaluation pour un apprenant présent', () => {
    usePresencesMock.mockReturnValue({
      data: [presence('a1', true)],
    } as UseQueryResult<PresenceAvecApprenant[], Error>)

    render(<SectionPresence coursId="cours-1" seanceId="seance-1" />)

    expect(screen.getByLabelText('Note de Aïcha Diallo')).toBeInTheDocument()
    expect(screen.getByLabelText('Passage évalué pour Aïcha Diallo')).toBeInTheDocument()
    expect(screen.getByLabelText('Commentaire sur Aïcha Diallo')).toBeInTheDocument()
  })

  it('masque les champs pour un apprenant absent', () => {
    usePresencesMock.mockReturnValue({
      data: [presence('a1', false)],
    } as UseQueryResult<PresenceAvecApprenant[], Error>)

    render(<SectionPresence coursId="cours-1" seanceId="seance-1" />)

    // Noter quelqu'un qui n'était pas là n'a pas de sens.
    expect(screen.queryByLabelText('Note de Aïcha Diallo')).not.toBeInTheDocument()
    // Moussa, lui, est présent par défaut : ses champs restent.
    expect(screen.getByLabelText('Note de Moussa Camara')).toBeInTheDocument()
  })

  it('masque les champs tant que la séance n’est pas enregistrée', () => {
    usePresencesMock.mockReturnValue({ data: [] } as unknown as UseQueryResult<
      PresenceAvecApprenant[],
      Error
    >)

    render(<SectionPresence coursId="cours-1" seanceId={undefined} />)

    expect(screen.queryByLabelText('Note de Aïcha Diallo')).not.toBeInTheDocument()
  })

  it('affiche le barème effectif à côté de la note', () => {
    usePresencesMock.mockReturnValue({ data: [] } as unknown as UseQueryResult<
      PresenceAvecApprenant[],
      Error
    >)

    render(<SectionPresence coursId="cours-1" seanceId="seance-1" />)
    expect(screen.getAllByText('/20').length).toBeGreaterThan(0)

    useParametresMock.mockReturnValue({
      data: { note_bareme: 10, enregistres: true },
    } as ReturnType<typeof useParametres>)

    render(<SectionPresence coursId="cours-1" seanceId="seance-1" />)
    expect(screen.getAllByText('/10').length).toBeGreaterThan(0)
  })

  it('pré-remplit le passage avec les exercices donnés la dernière fois', () => {
    usePresencesMock.mockReturnValue({ data: [] } as unknown as UseQueryResult<
      PresenceAvecApprenant[],
      Error
    >)

    render(
      <SectionPresence coursId="cours-1" seanceId="seance-1" passageSuggere="Al-Baqara 1-20" />
    )

    expect(screen.getByLabelText('Passage évalué pour Aïcha Diallo')).toHaveValue(
      'Al-Baqara 1-20'
    )
  })

  it('enregistre la note avec le barème effectif', async () => {
    usePresencesMock.mockReturnValue({ data: [] } as unknown as UseQueryResult<
      PresenceAvecApprenant[],
      Error
    >)
    const utilisateur = userEvent.setup()

    render(<SectionPresence coursId="cours-1" seanceId="seance-1" />)

    await utilisateur.type(screen.getByLabelText('Note de Aïcha Diallo'), '14,5')
    await utilisateur.click(screen.getAllByRole('button', { name: 'Enregistrer' })[0]!)

    expect(noterAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        seanceId: 'seance-1',
        apprenantId: 'a1',
        evaluation: expect.objectContaining({ note: 14.5, note_bareme: 20 }),
      })
    )
  })

  it('refuse une note hors barème sans rien enregistrer', async () => {
    usePresencesMock.mockReturnValue({ data: [] } as unknown as UseQueryResult<
      PresenceAvecApprenant[],
      Error
    >)
    const utilisateur = userEvent.setup()

    render(<SectionPresence coursId="cours-1" seanceId="seance-1" />)

    await utilisateur.type(screen.getByLabelText('Note de Aïcha Diallo'), '25')
    await utilisateur.click(screen.getAllByRole('button', { name: 'Enregistrer' })[0]!)

    expect(await screen.findByText(/comprise entre 0 et 20/)).toBeInTheDocument()
    expect(noterAsync).not.toHaveBeenCalled()
  })
})

describe('SectionPresence — cours individuel et cours vide', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useParametresMock.mockReturnValue({
      data: { note_bareme: 20, enregistres: true },
    } as ReturnType<typeof useParametres>)
    useNoterMock.mockReturnValue({
      mutateAsync: noterAsync,
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
    } as unknown as ReturnType<typeof useNoterApprenant>)
    usePresencesMock.mockReturnValue({ data: [] } as unknown as UseQueryResult<
      PresenceAvecApprenant[],
      Error
    >)
  })

  it('affiche une seule ligne notable pour un cours individuel', () => {
    useInscriptionsMock.mockReturnValue({
      data: [inscription('i1', AICHA)],
      isPending: false,
    } as UseQueryResult<InscriptionAvecApprenant[], Error>)

    render(<SectionPresence coursId="cours-1" seanceId="seance-1" />)

    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
    expect(screen.getByLabelText('Note de Aïcha Diallo')).toBeInTheDocument()
    expect(screen.getByLabelText('Passage évalué pour Aïcha Diallo')).toBeInTheDocument()
    expect(screen.getByLabelText('Commentaire sur Aïcha Diallo')).toBeInTheDocument()
  })

  it('affiche autant de lignes que d’inscrits pour un groupe', () => {
    useInscriptionsMock.mockReturnValue({
      data: [inscription('i1', AICHA), inscription('i2', MOUSSA)],
      isPending: false,
    } as UseQueryResult<InscriptionAvecApprenant[], Error>)

    render(<SectionPresence coursId="cours-1" seanceId="seance-1" />)

    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    expect(screen.getByLabelText('Note de Moussa Camara')).toBeInTheDocument()
  })

  it('invite à inscrire un apprenant quand le cours n’en a aucun', () => {
    useInscriptionsMock.mockReturnValue({
      data: [],
      isPending: false,
    } as unknown as UseQueryResult<InscriptionAvecApprenant[], Error>)

    render(<SectionPresence coursId="cours-1" seanceId="seance-1" />)

    // Une note sans apprenant n'a pas de sens : on dit quoi faire.
    expect(screen.getByText(/Inscrivez-en un depuis le détail du cours/)).toBeInTheDocument()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('annonce l’évaluation dans son titre, pas seulement la présence', () => {
    useInscriptionsMock.mockReturnValue({
      data: [inscription('i1', AICHA)],
      isPending: false,
    } as UseQueryResult<InscriptionAvecApprenant[], Error>)

    render(<SectionPresence coursId="cours-1" seanceId="seance-1" />)

    expect(screen.getByText(/Présence et évaluation/)).toBeInTheDocument()
  })
})
