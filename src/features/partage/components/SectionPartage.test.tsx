import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SectionPartage } from '@/features/partage/components/SectionPartage'
import {
  useActiverPartage,
  useDesactiverPartage,
  useRegenererPartage,
} from '@/features/partage/hooks/usePartage'

vi.mock('@/features/partage/hooks/usePartage', () => ({
  useActiverPartage: vi.fn(),
  useRegenererPartage: vi.fn(),
  useDesactiverPartage: vi.fn(),
}))

const COURS_ID = '9a8b7c6d-5e4f-4a3b-2c1d-0e9f8a7b6c5d'
const JETON = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

const activer = vi.fn()
const regenerer = vi.fn()
const desactiver = vi.fn()

function mutation(mutate: ReturnType<typeof vi.fn>, erreur: Error | null = null) {
  return { mutate, isPending: false, isError: Boolean(erreur), error: erreur } as never
}

function rendre(jetonPartage: string | null) {
  return render(
    <SectionPartage
      coursId={COURS_ID}
      libelle="Mémorisation Aïcha"
      jetonPartage={jetonPartage}
    />
  )
}

describe('SectionPartage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useActiverPartage).mockReturnValue(mutation(activer))
    vi.mocked(useRegenererPartage).mockReturnValue(mutation(regenerer))
    vi.mocked(useDesactiverPartage).mockReturnValue(mutation(desactiver))
  })

  it('propose d’activer le partage quand il ne l’est pas', async () => {
    const utilisateur = userEvent.setup()
    rendre(null)

    expect(screen.queryByLabelText('Lien de partage du cours')).not.toBeInTheDocument()
    await utilisateur.click(screen.getByRole('button', { name: 'Activer le partage' }))

    expect(activer).toHaveBeenCalledExactlyOnceWith(COURS_ID)
  })

  it('affiche l’URL complète une fois le partage actif', () => {
    rendre(JETON)

    expect(screen.getByLabelText('Lien de partage du cours')).toHaveValue(
      `${window.location.origin}/c/${JETON}`
    )
    expect(screen.queryByRole('button', { name: 'Activer le partage' })).not.toBeInTheDocument()
  })

  it('copie le lien dans le presse-papiers', async () => {
    const utilisateur = userEvent.setup()
    rendre(JETON)

    await utilisateur.click(screen.getByRole('button', { name: 'Copier le lien' }))

    await expect(navigator.clipboard.readText()).resolves.toBe(
      `${window.location.origin}/c/${JETON}`
    )
    expect(screen.getByRole('button', { name: 'Lien copié' })).toBeInTheDocument()
  })

  it('propose un partage WhatsApp contenant le lien et le nom du cours', () => {
    rendre(JETON)

    const lien = screen.getByRole('link', { name: /Partager sur WhatsApp/ })
    const href = lien.getAttribute('href') ?? ''

    expect(href.startsWith('https://wa.me/?text=')).toBe(true)
    const texte = decodeURIComponent(href.slice('https://wa.me/?text='.length))
    expect(texte).toContain('Mémorisation Aïcha')
    expect(texte).toContain(`${window.location.origin}/c/${JETON}`)
  })

  it('demande confirmation avant de régénérer le lien', async () => {
    const utilisateur = userEvent.setup()
    rendre(JETON)

    await utilisateur.click(screen.getByRole('button', { name: /Régénérer le lien/ }))

    // Casser un lien déjà distribué ne doit pas tenir à un clic isolé.
    expect(regenerer).not.toHaveBeenCalled()
    expect(
      screen.getByText(/L'ancien lien cessera immédiatement de fonctionner/)
    ).toBeInTheDocument()

    await utilisateur.click(screen.getByRole('button', { name: 'Confirmer' }))

    expect(regenerer).toHaveBeenCalledExactlyOnceWith(COURS_ID)
  })

  it('renonce si l’on annule la régénération', async () => {
    const utilisateur = userEvent.setup()
    rendre(JETON)

    await utilisateur.click(screen.getByRole('button', { name: /Régénérer le lien/ }))
    await utilisateur.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(regenerer).not.toHaveBeenCalled()
  })

  it('demande confirmation avant de désactiver le partage', async () => {
    const utilisateur = userEvent.setup()
    rendre(JETON)

    await utilisateur.click(screen.getByRole('button', { name: /Désactiver le partage/ }))
    expect(desactiver).not.toHaveBeenCalled()

    await utilisateur.click(screen.getByRole('button', { name: 'Confirmer' }))

    expect(desactiver).toHaveBeenCalledExactlyOnceWith(COURS_ID)
  })

  it('énonce ce que le lien rend visible, et ce qu’il ne rend pas visible', () => {
    rendre(JETON)

    const explication = screen.getByText(/Ce lien donne accès/)
    expect(explication).toHaveTextContent('lien de visioconférence')
    expect(explication).toHaveTextContent('dernier exercice donné')
    expect(explication).toHaveTextContent(/Ni les apprenants, ni les notes, ni les paiements/)
  })

  it('remonte une erreur de la mutation', () => {
    vi.mocked(useActiverPartage).mockReturnValue(
      mutation(activer, new Error('Session expirée.'))
    )

    rendre(null)

    expect(screen.getByText('Session expirée.')).toBeInTheDocument()
  })
})
