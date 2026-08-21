import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'

import { SectionExamen } from '@/features/inscriptions/components/SectionExamen'
import { useInscriptionsCours } from '@/features/inscriptions/hooks/useInscriptionsCours'
import { useNoterExamen } from '@/features/inscriptions/hooks/useNoterExamen'
import { useParametres } from '@/features/parametres/hooks/useParametres'
import { NOTATION_PAR_DEFAUT } from '@/shared/lib/rapport'
import type { Apprenant } from '@/shared/supabase/apprenantRepo'
import type { InscriptionAvecApprenant } from '@/shared/supabase/inscriptionRepo'
import type { ParametresEffectifs } from '@/shared/supabase/parametresRepo'

vi.mock('@/features/inscriptions/hooks/useInscriptionsCours', () => ({
  useInscriptionsCours: vi.fn(),
}))
vi.mock('@/features/inscriptions/hooks/useNoterExamen', () => ({ useNoterExamen: vi.fn() }))
vi.mock('@/features/parametres/hooks/useParametres', () => ({ useParametres: vi.fn() }))

const useInscriptionsMock = vi.mocked(useInscriptionsCours)
const useNoterMock = vi.mocked(useNoterExamen)
const useParametresMock = vi.mocked(useParametres)

const mutateAsync = vi.fn()

function apprenant(id: string, prenom: string, nom: string): Apprenant {
  return {
    id,
    owner_id: 'proprietaire',
    nom,
    prenom,
    contact: null,
    niveau: null,
    date_inscription: '2026-07-01',
    statut: 'actif',
    notes: null,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
  }
}

const AICHA = apprenant('a1', 'Aïcha', 'Diallo')
const MOUSSA = apprenant('a2', 'Moussa', 'Camara')

function inscription(
  id: string,
  personne: Apprenant,
  extra: Partial<InscriptionAvecApprenant> = {}
): InscriptionAvecApprenant {
  return {
    id,
    owner_id: 'proprietaire',
    apprenant_id: personne.id,
    cours_id: 'cours-1',
    note_examen: null,
    examen_bareme: null,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
    apprenant: personne,
    ...extra,
  }
}

function requete<T>(donnees: T, isPending = false) {
  return { data: donnees, isPending, isError: false, error: null } as UseQueryResult<T, Error>
}

function champNote(nom: string) {
  return screen.getByLabelText(`Note d'examen de ${nom}`)
}

describe('SectionExamen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useInscriptionsMock.mockReturnValue(
      requete([inscription('i1', AICHA), inscription('i2', MOUSSA)])
    )
    useParametresMock.mockReturnValue(
      requete<ParametresEffectifs>({
        note_bareme: 20,
        enregistres: true,
        ...NOTATION_PAR_DEFAUT,
      })
    )
    useNoterMock.mockReturnValue({
      mutateAsync,
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
    } as unknown as ReturnType<typeof useNoterExamen>)
  })

  it('affiche une ligne par apprenant inscrit', () => {
    render(<SectionExamen coursId="cours-1" />)

    expect(screen.getByText('Examen de fin de session')).toBeInTheDocument()
    expect(champNote('Aïcha Diallo')).toBeInTheDocument()
    expect(champNote('Moussa Camara')).toBeInTheDocument()
  })

  it('reprend la note déjà enregistrée et son barème', () => {
    useInscriptionsMock.mockReturnValue(
      requete([inscription('i1', AICHA, { note_examen: 8, examen_bareme: 10 })])
    )

    render(<SectionExamen coursId="cours-1" />)

    expect(champNote('Aïcha Diallo')).toHaveValue('8')
    expect(screen.getByLabelText("Barème de l'examen de Aïcha Diallo")).toHaveValue('10')
  })

  it('propose le barème du compte quand aucune note n’existe', () => {
    useParametresMock.mockReturnValue(
      requete<ParametresEffectifs>({
        note_bareme: 10,
        enregistres: true,
        ...NOTATION_PAR_DEFAUT,
      })
    )

    render(<SectionExamen coursId="cours-1" />)

    expect(screen.getByLabelText("Barème de l'examen de Aïcha Diallo")).toHaveValue('10')
  })

  it('enregistre la note avec son barème', async () => {
    const utilisateur = userEvent.setup()
    render(<SectionExamen coursId="cours-1" />)

    await utilisateur.type(champNote('Aïcha Diallo'), '15,5')
    await utilisateur.click(screen.getAllByRole('button', { name: 'Enregistrer' })[0]!)

    expect(mutateAsync).toHaveBeenCalledExactlyOnceWith({
      inscriptionId: 'i1',
      apprenantId: 'a1',
      coursId: 'cours-1',
      examen: { note_examen: 15.5, examen_bareme: 20 },
    })
  })

  it('fige le barème choisi avec la note', async () => {
    const utilisateur = userEvent.setup()
    render(<SectionExamen coursId="cours-1" />)

    await utilisateur.selectOptions(
      screen.getByLabelText("Barème de l'examen de Aïcha Diallo"),
      '10'
    )
    await utilisateur.type(champNote('Aïcha Diallo'), '9')
    await utilisateur.click(screen.getAllByRole('button', { name: 'Enregistrer' })[0]!)

    expect(mutateAsync).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ examen: { note_examen: 9, examen_bareme: 10 } })
    )
  })

  it('refuse une note au-dessus du barème, sans rien écrire', async () => {
    const utilisateur = userEvent.setup()
    render(<SectionExamen coursId="cours-1" />)

    await utilisateur.type(champNote('Aïcha Diallo'), '25')
    await utilisateur.click(screen.getAllByRole('button', { name: 'Enregistrer' })[0]!)

    expect(
      await screen.findByText('La note doit être comprise entre 0 et 20.')
    ).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('efface la note et son barème quand on vide le champ', async () => {
    useInscriptionsMock.mockReturnValue(
      requete([inscription('i1', AICHA, { note_examen: 15, examen_bareme: 20 })])
    )
    const utilisateur = userEvent.setup()
    render(<SectionExamen coursId="cours-1" />)

    await utilisateur.clear(champNote('Aïcha Diallo'))
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer' }))

    // Une note sans barème serait refusée par la base : les deux partent ensemble.
    expect(mutateAsync).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ examen: { note_examen: null, examen_bareme: null } })
    )
  })

  it('n’active le bouton qu’une fois quelque chose saisi', async () => {
    const utilisateur = userEvent.setup()
    render(<SectionExamen coursId="cours-1" />)

    expect(screen.getAllByRole('button', { name: 'Enregistrer' })[0]).toBeDisabled()
    await utilisateur.type(champNote('Aïcha Diallo'), '12')
    expect(screen.getAllByRole('button', { name: 'Enregistrer' })[0]).toBeEnabled()
  })

  it('invite à inscrire un apprenant quand le cours n’en a aucun', () => {
    useInscriptionsMock.mockReturnValue(requete<InscriptionAvecApprenant[]>([]))

    render(<SectionExamen coursId="cours-1" />)

    expect(screen.getByText(/Inscrivez-en un depuis le détail du cours/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument()
  })

  it('remonte une erreur d’enregistrement', () => {
    useNoterMock.mockReturnValue({
      mutateAsync,
      isPending: false,
      isError: true,
      isSuccess: false,
      error: new Error('Session expirée.'),
    } as unknown as ReturnType<typeof useNoterExamen>)

    render(<SectionExamen coursId="cours-1" />)

    expect(screen.getAllByText('Session expirée.')).toHaveLength(2)
  })
})
