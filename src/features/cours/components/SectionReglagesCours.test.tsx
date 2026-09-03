import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'

import { SectionReglagesCours } from '@/features/cours/components/SectionReglagesCours'
import { useDefinirReglagesCours } from '@/features/cours/hooks/useDefinirReglagesCours'
import { useParametres } from '@/features/parametres/hooks/useParametres'
import type * as logo from '@/features/parametres/logo'
import { redimensionnerLogo } from '@/features/parametres/logo'
import { NOTATION_PAR_DEFAUT } from '@/shared/lib/rapport'
import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'
import type { ParametresEffectifs } from '@/shared/supabase/parametresRepo'

vi.mock('@/features/cours/hooks/useDefinirReglagesCours', () => ({
  useDefinirReglagesCours: vi.fn(),
}))
vi.mock('@/features/parametres/hooks/useParametres', () => ({ useParametres: vi.fn() }))
vi.mock('@/features/parametres/logo', async (original) => ({
  ...(await original<typeof logo>()),
  redimensionnerLogo: vi.fn(),
}))

const useReglagesMock = vi.mocked(useDefinirReglagesCours)
const useParametresMock = vi.mocked(useParametres)
const redimensionnerMock = vi.mocked(redimensionnerLogo)
const mutate = vi.fn()
const mutateAsync = vi.fn()

const LOGO_COURS = 'data:image/png;base64,COURS'

function cours(extra: Partial<CoursAvecDetails> = {}): CoursAvecDetails {
  return {
    id: 'c1',
    centre_id: 'centre-1',
    libelle: 'Groupe Hifz',
    type_cours_id: 'type-1',
    format: 'groupe',
    date_debut: '2026-07-01',
    date_fin: null,
    lien_meet: null,
    jeton_partage: null,
    session_id: 'session-1',
    niveau: null,
    reconduit_de: null,
    enseignant_id: null,
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
    inscription: [{ count: 0 }],
    tarif: [],
    creneau: [],
    ...extra,
  }
}

async function ouvrir(extra: Partial<CoursAvecDetails> = {}) {
  const utilisateur = userEvent.setup()
  render(<SectionReglagesCours cours={cours(extra)} />)

  await utilisateur.click(screen.getByRole('button', { name: /Réglages spécifiques/ }))

  return utilisateur
}

const boutonEnregistrer = () => screen.getByRole('button', { name: /Enregistrer les réglages/ })

describe('SectionReglagesCours', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    redimensionnerMock.mockResolvedValue(LOGO_COURS)
    useParametresMock.mockReturnValue({
      data: {
        note_bareme: 20,
        logo: 'data:image/png;base64,CENTRE',
        enregistres: true,
        ...NOTATION_PAR_DEFAUT,
      },
      isPending: false,
      isError: false,
      error: null,
    } as UseQueryResult<ParametresEffectifs, Error>)
    useReglagesMock.mockReturnValue({
      mutate,
      mutateAsync,
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
    } as unknown as ReturnType<typeof useDefinirReglagesCours>)
  })

  it('reste repliée par défaut', () => {
    render(<SectionReglagesCours cours={cours()} />)

    expect(screen.getByRole('button', { name: /Réglages spécifiques/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    expect(screen.queryByLabelText("Part de l'assiduité")).not.toBeInTheDocument()
  })

  it('annonce la valeur héritée dans chaque champ vide', async () => {
    await ouvrir()

    // Le vide dit « j'hérite » ; le placeholder dit de quoi.
    expect(screen.getByLabelText("Part de l'assiduité")).toHaveAttribute(
      'placeholder',
      'Hérité : 3'
    )
    expect(screen.getByLabelText('Pénalité par absence')).toHaveAttribute(
      'placeholder',
      'Hérité : 0,5'
    )
    expect(screen.getByLabelText('Pénalité par retard')).toHaveAttribute(
      'placeholder',
      'Hérité : 0,25'
    )
  })

  it('propose de revenir à l’héritage sur chaque liste', async () => {
    await ouvrir()

    expect(screen.getByLabelText("Appliquer l'assiduité")).toHaveValue('')
    expect(screen.getByText('Hérité : oui')).toBeInTheDocument()
    expect(screen.getByText(/Hérité : Moyenne des devoirs/)).toBeInTheDocument()
  })

  it('n’écrit que des null quand rien n’est saisi', async () => {
    const utilisateur = await ouvrir()

    await utilisateur.click(boutonEnregistrer())

    expect(mutate).toHaveBeenCalledExactlyOnceWith({
      coursId: 'c1',
      surcharges: {
        logo: null,
        assiduite_active: null,
        base_academique: null,
        bareme_assiduite: null,
        penalite_absence: null,
        penalite_retard: null,
        penaliser_absences_excusees: null,
      },
    })
  })

  it('écrit les surcharges saisies', async () => {
    const utilisateur = await ouvrir()

    await utilisateur.type(screen.getByLabelText("Part de l'assiduité"), '5')
    await utilisateur.type(screen.getByLabelText('Pénalité par absence'), '1,25')
    await utilisateur.selectOptions(screen.getByLabelText("Appliquer l'assiduité"), 'non')
    await utilisateur.click(boutonEnregistrer())

    expect(mutate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        surcharges: expect.objectContaining({
          bareme_assiduite: 5,
          penalite_absence: 1.25,
          assiduite_active: false,
        }),
      })
    )
  })

  it('reprend les surcharges déjà posées', async () => {
    await ouvrir({
      bareme_assiduite: 5,
      assiduite_active: false,
      base_academique: 'examen_seul',
    })

    expect(screen.getByLabelText("Part de l'assiduité")).toHaveValue('5')
    expect(screen.getByLabelText("Appliquer l'assiduité")).toHaveValue('non')
    expect(screen.getByLabelText('Base de la note académique')).toHaveValue('examen_seul')
  })

  it('revient à l’héritage quand on vide un champ', async () => {
    const utilisateur = await ouvrir({ bareme_assiduite: 5 })

    await utilisateur.clear(screen.getByLabelText("Part de l'assiduité"))
    await utilisateur.click(boutonEnregistrer())

    expect(mutate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        surcharges: expect.objectContaining({ bareme_assiduite: null }),
      })
    )
  })

  it('annonce l’héritage du logo tant que le cours n’en a pas', async () => {
    await ouvrir()

    expect(screen.getByText('Hérité : le logo du centre.')).toBeInTheDocument()
    expect(screen.queryByAltText('Logo du cours')).not.toBeInTheDocument()
  })

  it('enregistre un logo propre au cours', async () => {
    const utilisateur = await ouvrir()

    await utilisateur.upload(
      screen.getByLabelText('Choisir un logo pour ce cours'),
      new File([new Uint8Array(8)], 'l.png', { type: 'image/png' })
    )

    expect(mutateAsync).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ surcharges: expect.objectContaining({ logo: LOGO_COURS }) })
    )
  })

  it('permet de revenir au logo du centre', async () => {
    const utilisateur = await ouvrir({ logo: LOGO_COURS })

    expect(screen.getByAltText('Logo du cours')).toHaveAttribute('src', LOGO_COURS)
    await utilisateur.click(screen.getByRole('button', { name: /Revenir au logo du centre/ }))

    expect(mutate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ surcharges: expect.objectContaining({ logo: null }) })
    )
  })

  it('remonte une erreur d’enregistrement', async () => {
    useReglagesMock.mockReturnValue({
      mutate,
      mutateAsync,
      isPending: false,
      isError: true,
      isSuccess: false,
      error: new Error('Session expirée.'),
    } as unknown as ReturnType<typeof useDefinirReglagesCours>)

    await ouvrir()

    expect(screen.getByText('Session expirée.')).toBeInTheDocument()
  })
})
