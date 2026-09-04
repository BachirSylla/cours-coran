import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SectionLogo } from '@/features/parametres/components/SectionLogo'
import { useEnregistrerLogo } from '@/features/parametres/hooks/useEnregistrerLogo'
import type * as logo from '@/features/parametres/logo'
import { redimensionnerLogo } from '@/features/parametres/logo'
import { NOTATION_PAR_DEFAUT } from '@/shared/lib/rapport'
import type { ParametresEffectifs } from '@/shared/supabase/parametresRepo'

vi.mock('@/features/parametres/hooks/useEnregistrerLogo', () => ({
  useEnregistrerLogo: vi.fn(),
}))
// Le redimensionnement a ses propres tests : ici on vérifie le câblage.
vi.mock('@/features/parametres/logo', async (original) => ({
  ...(await original<typeof logo>()),
  redimensionnerLogo: vi.fn(),
}))

const useEnregistrerMock = vi.mocked(useEnregistrerLogo)
const redimensionnerMock = vi.mocked(redimensionnerLogo)
const mutateAsync = vi.fn()
const mutate = vi.fn()

const LOGO = 'data:image/png;base64,AAAA'

function parametres(logo: string | null): ParametresEffectifs {
  return {
    note_bareme: 20,
    logo,
    mode_facturation: 'mensuel',
    enregistres: true,
    ...NOTATION_PAR_DEFAUT,
  }
}

function rendre(logo: string | null = null) {
  return render(<SectionLogo parametres={parametres(logo)} />)
}

function image(type = 'image/png') {
  return new File([new Uint8Array(8)], 'logo.png', { type })
}

const champ = () => screen.getByLabelText('Choisir un logo')

describe('SectionLogo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    redimensionnerMock.mockResolvedValue(LOGO)
    useEnregistrerMock.mockReturnValue({
      mutate,
      mutateAsync,
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useEnregistrerLogo>)
  })

  it('n’affiche aucun aperçu tant qu’aucun logo n’est enregistré', () => {
    rendre()

    expect(screen.queryByAltText('Logo du centre')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choisir un logo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retirer' })).not.toBeInTheDocument()
  })

  it('affiche l’aperçu du logo enregistré', () => {
    rendre(LOGO)

    expect(screen.getByAltText('Logo du centre')).toHaveAttribute('src', LOGO)
    expect(screen.getByRole('button', { name: 'Remplacer le logo' })).toBeInTheDocument()
  })

  it('enregistre la data URL du fichier choisi', async () => {
    const utilisateur = userEvent.setup()
    rendre()

    await utilisateur.upload(champ(), image())

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledExactlyOnceWith(LOGO))
  })

  /**
   * L'attribut `accept` du champ écarte déjà les formats non prévus — le
   * navigateur, comme `user-event`, filtre la sélection. Le refus utile est donc
   * celui qui survient **après** : image trop lourde, ou fichier corrompu qui
   * n'est pas une image lisible.
   */
  it('affiche le refus quand la préparation échoue, sans rien écrire', async () => {
    redimensionnerMock.mockRejectedValue(
      new Error('Image trop lourde. Choisissez un fichier de moins de 8 Mo.')
    )
    const utilisateur = userEvent.setup()
    rendre()

    await utilisateur.upload(champ(), image())

    expect(await screen.findByText(/Image trop lourde/)).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('n’accepte que les formats prévus au niveau du champ', () => {
    rendre()

    expect(champ()).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp')
  })

  it('retire le logo en écrivant null', async () => {
    const utilisateur = userEvent.setup()
    rendre(LOGO)

    await utilisateur.click(screen.getByRole('button', { name: 'Retirer' }))

    expect(mutate).toHaveBeenCalledExactlyOnceWith(null)
  })

  it('remonte une erreur d’enregistrement', () => {
    useEnregistrerMock.mockReturnValue({
      mutate,
      mutateAsync,
      isPending: false,
      isError: true,
      error: new Error('Session expirée.'),
    } as unknown as ReturnType<typeof useEnregistrerLogo>)

    rendre()

    expect(screen.getByText('Session expirée.')).toBeInTheDocument()
  })

  it('dit à quoi sert le logo', () => {
    rendre()

    expect(screen.getByText(/en-tête du rapport de session/)).toBeInTheDocument()
  })
})
