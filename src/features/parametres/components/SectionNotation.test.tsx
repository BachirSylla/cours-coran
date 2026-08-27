import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SectionNotation } from '@/features/parametres/components/SectionNotation'
import { useEnregistrerNotation } from '@/features/parametres/hooks/useEnregistrerNotation'
import { NOTATION_PAR_DEFAUT } from '@/shared/lib/rapport'
import type { ParametresEffectifs } from '@/shared/supabase/parametresRepo'

vi.mock('@/features/parametres/hooks/useEnregistrerNotation', () => ({
  useEnregistrerNotation: vi.fn(),
}))

const useEnregistrerMock = vi.mocked(useEnregistrerNotation)
const mutateAsync = vi.fn()

function parametres(extra: Partial<ParametresEffectifs> = {}): ParametresEffectifs {
  return { note_bareme: 20, logo: null, enregistres: true, ...NOTATION_PAR_DEFAUT, ...extra }
}

function rendre(extra: Partial<ParametresEffectifs> = {}) {
  return render(<SectionNotation parametres={parametres(extra)} />)
}

const champAssiduite = () => screen.getByLabelText("Part de l'assiduité")
const boutonEnregistrer = () => screen.getByRole('button', { name: 'Enregistrer' })

describe('SectionNotation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useEnregistrerMock.mockReturnValue({
      mutateAsync,
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
    } as unknown as ReturnType<typeof useEnregistrerNotation>)
  })

  it('affiche les réglages en vigueur', () => {
    rendre()

    expect(champAssiduite()).toHaveValue('3')
    expect(screen.getByLabelText('Pénalité par absence')).toHaveValue('0,5')
    expect(screen.getByLabelText('Pénalité par retard')).toHaveValue('0,25')
    expect(
      screen.getByRole('checkbox', { name: /absences excusées retirent aussi/i })
    ).not.toBeChecked()
  })

  it('déduit la part académique de la part d’assiduité', () => {
    rendre()

    expect(screen.getByText('17')).toBeInTheDocument()
  })

  it('met à jour la part académique à chaque frappe', async () => {
    const utilisateur = userEvent.setup()
    rendre()

    await utilisateur.clear(champAssiduite())
    await utilisateur.type(champAssiduite(), '5')

    // La somme reste 20 : elle n'est jamais saisie, donc jamais fausse.
    expect(screen.getByText('15')).toBeInTheDocument()
  })

  it('montre un exemple chiffré, calculé comme le fera le rapport', () => {
    rendre()

    // 2 absences × 0,5 + 1 retard × 0,25 = 1,25 retiré de 3.
    expect(screen.getByText('1,75 / 3')).toBeInTheDocument()
  })

  it('recalcule l’exemple quand les pénalités changent', async () => {
    const utilisateur = userEvent.setup()
    rendre()

    await utilisateur.clear(screen.getByLabelText('Pénalité par absence'))
    await utilisateur.type(screen.getByLabelText('Pénalité par absence'), '1')

    // 2 × 1 + 1 × 0,25 = 2,25 : il ne reste que 0,75.
    expect(screen.getByText('0,75 / 3')).toBeInTheDocument()
  })

  it('n’active le bouton qu’après une modification', async () => {
    const utilisateur = userEvent.setup()
    rendre()

    expect(boutonEnregistrer()).toBeDisabled()
    await utilisateur.type(champAssiduite(), '0')
    expect(boutonEnregistrer()).toBeEnabled()
  })

  it('enregistre la configuration complète, part académique comprise', async () => {
    const utilisateur = userEvent.setup()
    rendre()

    await utilisateur.clear(champAssiduite())
    await utilisateur.type(champAssiduite(), '5')
    await utilisateur.click(boutonEnregistrer())

    expect(mutateAsync).toHaveBeenCalledExactlyOnceWith({
      assiduite_active: true,
      base_academique: 'moyenne_devoirs_examen',
      bareme_academique: 15,
      bareme_assiduite: 5,
      penalite_absence: 0.5,
      penalite_retard: 0.25,
      penaliser_absences_excusees: false,
    })
  })

  it('affiche la base académique en vigueur et propose les deux', () => {
    rendre()

    const selecteur = screen.getByLabelText('Base de la note académique')
    expect(selecteur).toHaveValue('moyenne_devoirs_examen')
    expect(
      within(selecteur)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['Examen seul', 'Moyenne des devoirs et de l’examen'])
  })

  it('explique la formule, pas seulement son nom', async () => {
    const utilisateur = userEvent.setup()
    rendre()

    expect(screen.getByText(/comptent à parts égales/)).toBeInTheDocument()

    await utilisateur.selectOptions(
      screen.getByLabelText('Base de la note académique'),
      'examen_seul'
    )

    expect(screen.getByText(/Seul l'examen de fin de session compte/)).toBeInTheDocument()
  })

  it('enregistre la base choisie', async () => {
    const utilisateur = userEvent.setup()
    rendre()

    await utilisateur.selectOptions(
      screen.getByLabelText('Base de la note académique'),
      'examen_seul'
    )
    await utilisateur.click(boutonEnregistrer())

    expect(mutateAsync).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ base_academique: 'examen_seul' })
    )
  })

  it('reprend la base déjà enregistrée', () => {
    rendre({ base_academique: 'examen_seul' })

    expect(screen.getByLabelText('Base de la note académique')).toHaveValue('examen_seul')
  })

  it('bascule la prise en compte des absences excusées', async () => {
    const utilisateur = userEvent.setup()
    rendre()

    await utilisateur.click(
      screen.getByRole('checkbox', { name: /absences excusées retirent aussi/i })
    )
    await utilisateur.click(boutonEnregistrer())

    expect(mutateAsync).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ penaliser_absences_excusees: true })
    )
  })

  it('affiche l’état coché quand le réglage est déjà actif', () => {
    rendre({ penaliser_absences_excusees: true })

    expect(
      screen.getByRole('checkbox', { name: /absences excusées retirent aussi/i })
    ).toBeChecked()
  })

  it('refuse une part d’assiduité hors bornes, sans rien écrire', async () => {
    const utilisateur = userEvent.setup()
    rendre()

    await utilisateur.clear(champAssiduite())
    await utilisateur.type(champAssiduite(), '25')
    await utilisateur.click(boutonEnregistrer())

    expect(
      await screen.findByText("La part d'assiduité doit être un entier entre 0 et 20.")
    ).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('remonte une erreur d’enregistrement', () => {
    useEnregistrerMock.mockReturnValue({
      mutateAsync,
      isPending: false,
      isError: true,
      isSuccess: false,
      error: new Error('Session expirée.'),
    } as unknown as ReturnType<typeof useEnregistrerNotation>)

    rendre()

    expect(screen.getByText('Session expirée.')).toBeInTheDocument()
  })

  it('rappelle qu’une absence excusée reste visible', () => {
    rendre()

    expect(screen.getByText(/reste visible dans le bilan/)).toBeInTheDocument()
  })
})
