import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'

import { useApprenants } from '@/features/apprenants/hooks/useApprenants'
import { useReglementsInscription } from '@/features/paiements/hooks/useReglementsInscription'
import { SectionInscriptions } from '@/features/inscriptions/components/SectionInscriptions'
import { useAjouterInscription } from '@/features/inscriptions/hooks/useAjouterInscription'
import {
  useInscriptionsCours,
  useInscriptionsSessionPrecedente,
} from '@/features/inscriptions/hooks/useInscriptionsCours'
import { useRetirerInscription } from '@/features/inscriptions/hooks/useRetirerInscription'
import type { Apprenant } from '@/shared/supabase/apprenantRepo'
import type { InscriptionAvecApprenant } from '@/shared/supabase/inscriptionRepo'

/*
 * La confirmation de retrait lit les règlements pour annoncer ce qu'elle détruit
 * (0026) ; ce fichier ne monte pas de `QueryClientProvider`.
 */
vi.mock('@/features/paiements/hooks/useReglementsInscription', () => ({
  useReglementsInscription: vi.fn(),
}))
vi.mock('@/features/apprenants/hooks/useApprenants', () => ({ useApprenants: vi.fn() }))
vi.mock('@/features/inscriptions/hooks/useInscriptionsCours', () => ({
  useInscriptionsCours: vi.fn(),
  useInscriptionsSessionPrecedente: vi.fn(),
}))
vi.mock('@/features/inscriptions/hooks/useAjouterInscription', () => ({
  useAjouterInscription: vi.fn(),
}))
vi.mock('@/features/inscriptions/hooks/useRetirerInscription', () => ({
  useRetirerInscription: vi.fn(),
}))

const useInscriptionsMock = vi.mocked(useInscriptionsCours)
const usePrecedentsMock = vi.mocked(useInscriptionsSessionPrecedente)
const useReglementsInscriptionMock = vi.mocked(useReglementsInscription)
const useApprenantsMock = vi.mocked(useApprenants)
const useAjouterMock = vi.mocked(useAjouterInscription)
const useRetirerMock = vi.mocked(useRetirerInscription)

function mutationInerte<T>(supplement: Record<string, unknown> = {}): T {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    ...supplement,
  } as unknown as T
}

function apprenant(id: string, prenom: string, nom: string): Apprenant {
  return {
    id,
    centre_id: 'centre-1',
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

function inscription(
  id: string,
  personne: Apprenant,
  extra: Partial<InscriptionAvecApprenant> = {}
): InscriptionAvecApprenant {
  return {
    id,
    centre_id: 'centre-1',
    apprenant_id: personne.id,
    cours_id: 'cours-1',
    note_examen: null,
    examen_bareme: null,
    jeton: null,
    created_at: '2026-07-27T10:00:00Z',
    updated_at: '2026-07-27T10:00:00Z',
    apprenant: personne,
    ...extra,
  }
}

function simulerInscriptions(etat: Partial<UseQueryResult<InscriptionAvecApprenant[], Error>>) {
  useInscriptionsMock.mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
    error: null,
    ...etat,
  } as UseQueryResult<InscriptionAvecApprenant[], Error>)
}

const AICHA = apprenant('a1', 'Aïcha', 'Diallo')
const MOUSSA = apprenant('a2', 'Moussa', 'Camara')

describe('SectionInscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useReglementsInscriptionMock.mockReturnValue({ data: [] } as unknown as ReturnType<
      typeof useReglementsInscription
    >)
    // Aucun cours précédent : le cas ordinaire, hors reconduction.
    usePrecedentsMock.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      error: null,
    } as unknown as UseQueryResult<InscriptionAvecApprenant[], Error>)
    useApprenantsMock.mockReturnValue({
      data: [AICHA, MOUSSA],
      isPending: false,
      isError: false,
      error: null,
    } as UseQueryResult<Apprenant[], Error>)
    useAjouterMock.mockReturnValue(mutationInerte<ReturnType<typeof useAjouterInscription>>())
    useRetirerMock.mockReturnValue(mutationInerte<ReturnType<typeof useRetirerInscription>>())
  })

  it('affiche un état vide quand personne n’est inscrit', () => {
    simulerInscriptions({ data: [] })

    render(<SectionInscriptions coursId="cours-1" format="groupe" />)

    expect(screen.getByText('Aucun apprenant inscrit à ce cours.')).toBeInTheDocument()
  })

  it('liste les inscrits avec leur nombre', () => {
    simulerInscriptions({ data: [inscription('i1', AICHA), inscription('i2', MOUSSA)] })

    render(<SectionInscriptions coursId="cours-1" format="groupe" />)

    expect(screen.getByText('Aïcha Diallo')).toBeInTheDocument()
    expect(screen.getByText('Moussa Camara')).toBeInTheDocument()
    expect(screen.getByText('(2)')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Retirer Aïcha Diallo du cours/ })
    ).toBeInTheDocument()
  })

  it('laisse inscrire librement dans un groupe déjà peuplé', () => {
    simulerInscriptions({ data: [inscription('i1', AICHA), inscription('i2', MOUSSA)] })

    render(<SectionInscriptions coursId="cours-1" format="groupe" />)

    expect(screen.getByRole('combobox', { name: /inscrire un apprenant/i })).toBeEnabled()
    expect(screen.queryByText(/un seul apprenant/)).not.toBeInTheDocument()
  })

  it('autorise le premier inscrit d’un cours individuel', () => {
    simulerInscriptions({ data: [] })

    render(<SectionInscriptions coursId="cours-1" format="individuel" />)

    expect(screen.getByRole('combobox', { name: /inscrire un apprenant/i })).toBeEnabled()
  })

  it('bloque le deuxième inscrit d’un cours individuel, en expliquant pourquoi', () => {
    simulerInscriptions({ data: [inscription('i1', AICHA)] })

    render(<SectionInscriptions coursId="cours-1" format="individuel" />)

    expect(screen.getByRole('combobox', { name: /inscrire un apprenant/i })).toBeDisabled()
    // Un bouton désactivé sans explication serait un cul-de-sac.
    expect(screen.getByText(/ne peut accueillir qu'un seul apprenant/)).toBeInTheDocument()
  })

  it('remonte l’erreur d’une inscription refusée par la base', () => {
    simulerInscriptions({ data: [] })
    useAjouterMock.mockReturnValue(
      mutationInerte<ReturnType<typeof useAjouterInscription>>({
        isError: true,
        error: new Error('Cet apprenant est déjà inscrit à ce cours.'),
      })
    )

    render(<SectionInscriptions coursId="cours-1" format="groupe" />)

    expect(screen.getByText('Cet apprenant est déjà inscrit à ce cours.')).toBeInTheDocument()
  })

  it('affiche un indicateur pendant le chargement', () => {
    simulerInscriptions({ isPending: true, data: undefined })

    render(<SectionInscriptions coursId="cours-1" format="groupe" />)

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  /**
   * La note d'examen vit sur l'inscription : la retirer la supprime. C'est une
   * perte irréversible, elle doit être annoncée avant, pas découverte après.
   */
  describe('retrait d’un apprenant', () => {
    async function ouvrirLaConfirmation() {
      const utilisateur = userEvent.setup()
      render(<SectionInscriptions coursId="cours-1" format="groupe" />)

      await utilisateur.click(
        screen.getByRole('button', { name: /Retirer Aïcha Diallo du cours/ })
      )
    }

    it('avertit que la note d’examen sera perdue, en la citant', async () => {
      simulerInscriptions({
        data: [inscription('i1', AICHA, { note_examen: 15.5, examen_bareme: 20 })],
      })

      await ouvrirLaConfirmation()

      expect(
        screen.getByText(/Sa note d'examen \(15,5\/20\) sera définitivement supprimée/)
      ).toBeInTheDocument()
    })

    /*
     * ⚠️ `reglement` cascade depuis `inscription` (0026) : retirer un apprenant
     * emporte tout ce qu'il a versé. La migration pose que l'écran DOIT
     * l'annoncer avant — la première version ne le faisait pas, et l'argent
     * disparaissait en silence.
     */
    it('avertit que les règlements seront perdus, avec le montant encaissé', async () => {
      simulerInscriptions({ data: [inscription('i1', AICHA)] })
      useReglementsInscriptionMock.mockReturnValue({
        data: [
          { montant_recu: 15000 },
          { montant_recu: 5000 },
        ],
      } as unknown as ReturnType<typeof useReglementsInscription>)

      await ouvrirLaConfirmation()

      expect(screen.getByText(/2 suivis de règlement seront définitivement supprimés/)).
        toBeInTheDocument()
      expect(screen.getByText(/20\s?000/)).toBeInTheDocument()
      expect(screen.getByText(/disparaîtra des totaux/)).toBeInTheDocument()
    })

    it('accorde au singulier, et tait le montant quand rien n’a été encaissé', async () => {
      simulerInscriptions({ data: [inscription('i1', AICHA)] })
      useReglementsInscriptionMock.mockReturnValue({
        data: [{ montant_recu: 0 }],
      } as unknown as ReturnType<typeof useReglementsInscription>)

      await ouvrirLaConfirmation()

      expect(
        screen.getByText(/Son suivi de règlement sera définitivement supprimé\./)
      ).toBeInTheDocument()
      expect(screen.queryByText(/déjà encaissés/)).not.toBeInTheDocument()
    })

    it('se tait quand il n’y a aucun règlement à perdre', async () => {
      simulerInscriptions({ data: [inscription('i1', AICHA)] })

      await ouvrirLaConfirmation()

      expect(screen.queryByText(/suivi de règlement/)).not.toBeInTheDocument()
    })

    it('se tait quand il n’y a aucune note à perdre', async () => {
      simulerInscriptions({ data: [inscription('i1', AICHA)] })

      await ouvrirLaConfirmation()

      // La confirmation existe bien, mais sans avertissement superflu.
      expect(screen.getByText(/ne suivra plus ce cours/)).toBeInTheDocument()
      expect(screen.queryByText(/note d'examen/)).not.toBeInTheDocument()
    })

    it('se tait aussi devant une note sans barème', async () => {
      // La base l'interdit ; l'écran ne doit pas pour autant afficher « /null ».
      simulerInscriptions({
        data: [inscription('i1', AICHA, { note_examen: 15.5, examen_bareme: null })],
      })

      await ouvrirLaConfirmation()

      expect(screen.queryByText(/note d'examen/)).not.toBeInTheDocument()
    })
  })
})

/**
 * Après une reconduction, la section propose les inscrits du cours d'origine.
 *
 * ⚠️ PROPOSE. La reconduction ne reprend délibérément aucune inscription :
 * promouvoir quelqu'un de Niveau 1 à Niveau 2 est une décision pédagogique, et
 * tout le monde ne se réinscrit pas. Le bouton fait gagner les clics, il ne
 * décide rien.
 */
const ajouter = vi.fn()

describe('SectionInscriptions — anciens inscrits d’un cours reconduit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useApprenantsMock.mockReturnValue({
      data: [AICHA, MOUSSA],
    } as unknown as ReturnType<typeof useApprenants>)
    useAjouterMock.mockReturnValue(
      mutationInerte<ReturnType<typeof useAjouterInscription>>({ mutate: ajouter })
    )
    useRetirerMock.mockReturnValue(mutationInerte<ReturnType<typeof useRetirerInscription>>())
    simulerInscriptions({})
  })

  function simulerPrecedents(data: InscriptionAvecApprenant[]) {
    usePrecedentsMock.mockReturnValue({
      data,
      isPending: false,
      isError: false,
      error: null,
    } as unknown as UseQueryResult<InscriptionAvecApprenant[], Error>)
  }

  it('propose les inscrits de la session précédente', () => {
    simulerPrecedents([inscription('i9', AICHA), inscription('i10', MOUSSA)])

    render(<SectionInscriptions coursId="cours-1" format="groupe" reconduitDe="cours-source" />)

    expect(screen.getByText(/2 apprenants étaient inscrits/)).toBeInTheDocument()
    // Nom EXACT : « Retirer Aïcha Diallo du cours » contient aussi son nom.
    expect(screen.getByRole('button', { name: 'Aïcha Diallo' })).toBeInTheDocument()
  })

  it('n’en propose aucun quand le cours n’est pas issu d’une reconduction', () => {
    simulerPrecedents([inscription('i9', AICHA)])

    render(<SectionInscriptions coursId="cours-1" format="groupe" />)

    expect(screen.queryByText(/étaient inscrits/)).not.toBeInTheDocument()
    expect(screen.queryByText(/était inscrit/)).not.toBeInTheDocument()
  })

  it('ne propose pas quelqu’un qui est DÉJÀ inscrit ici', () => {
    simulerInscriptions({ data: [inscription('i1', AICHA)] })
    simulerPrecedents([inscription('i9', AICHA), inscription('i10', MOUSSA)])

    render(<SectionInscriptions coursId="cours-1" format="groupe" reconduitDe="cours-source" />)

    expect(screen.getByText(/1 apprenant était inscrit/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aïcha Diallo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Moussa Camara' })).toBeInTheDocument()
  })

  it('inscrit d’un clic, mais un par un — jamais tous d’un coup', async () => {
    const utilisateur = userEvent.setup()
    simulerPrecedents([inscription('i9', AICHA), inscription('i10', MOUSSA)])

    render(<SectionInscriptions coursId="cours-1" format="groupe" reconduitDe="cours-source" />)

    // Aucun bouton « tout replacer » : chaque réinscription est un choix.
    expect(screen.queryByRole('button', { name: /Tout/ })).not.toBeInTheDocument()

    await utilisateur.click(screen.getByRole('button', { name: 'Aïcha Diallo' }))

    expect(ajouter).toHaveBeenCalledTimes(1)
    expect(ajouter).toHaveBeenCalledWith({ apprenantId: 'a1', coursId: 'cours-1' })
  })

  /*
   * ⚠️ Le cache ne se rafraîchit qu'après invalidation : entre le clic et le
   * refetch, la personne resterait proposée. Sur un cours individuel, un second
   * clic passerait la règle de capacité (§5.7), qui est applicative et n'a aucun
   * filet en base.
   */
  it('retire aussitôt la personne replacée, sans attendre le rafraîchissement', async () => {
    const utilisateur = userEvent.setup()
    simulerPrecedents([inscription('i9', AICHA), inscription('i10', MOUSSA)])

    render(<SectionInscriptions coursId="cours-1" format="groupe" reconduitDe="cours-source" />)

    await utilisateur.click(screen.getByRole('button', { name: 'Aïcha Diallo' }))

    // Le cache n'a pas bougé — et pourtant elle n'est plus proposée.
    expect(screen.queryByRole('button', { name: 'Aïcha Diallo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Moussa Camara' })).toBeInTheDocument()
    expect(ajouter).toHaveBeenCalledTimes(1)
  })

  /*
   * Un enseignant consulte la composition de sa classe sans la modifier : lui
   * proposer des boutons que la RLS refuserait serait mentir.
   */
  it('ne propose rien en lecture seule', () => {
    simulerPrecedents([inscription('i9', AICHA)])

    render(
      <SectionInscriptions coursId="cours-1" format="groupe" reconduitDe="cours-source" lectureSeule />
    )

    expect(screen.queryByText(/était inscrit/)).not.toBeInTheDocument()
  })

  /*
   * Un cours individuel plein ne peut plus accueillir personne : proposer
   * quelqu'un serait tendre un bouton qui échouerait (§5.7).
   */
  it('ne propose rien quand la capacité est atteinte', () => {
    simulerInscriptions({ data: [inscription('i1', MOUSSA)] })
    simulerPrecedents([inscription('i9', AICHA)])

    render(
      <SectionInscriptions coursId="cours-1" format="individuel" reconduitDe="cours-source" />
    )

    expect(screen.queryByText(/était inscrit/)).not.toBeInTheDocument()
  })
})
