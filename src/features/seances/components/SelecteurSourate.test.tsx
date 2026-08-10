import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { SelecteurSourate } from '@/features/seances/components/SelecteurSourate'

async function ouvrir() {
  const utilisateur = userEvent.setup()
  await utilisateur.click(screen.getByRole('combobox', { name: /choisir une sourate/i }))
  return utilisateur
}

describe('SelecteurSourate', () => {
  it('affiche une invite quand rien n’est sélectionné', () => {
    render(<SelecteurSourate valeur={null} onChange={vi.fn()} />)

    expect(screen.getByRole('combobox', { name: /choisir une sourate/i })).toHaveTextContent(
      'Choisir une sourate…'
    )
  })

  it('affiche « numéro · nom » quand une sourate est sélectionnée', () => {
    render(<SelecteurSourate valeur={2} onChange={vi.fn()} />)

    expect(screen.getByRole('combobox')).toHaveTextContent('2 · Al-Baqara')
  })

  it('ouvre la liste complète des 114 sourates', async () => {
    render(<SelecteurSourate valeur={null} onChange={vi.fn()} />)

    await ouvrir()

    expect(screen.getByText('1 · Al-Fâtiha')).toBeInTheDocument()
    expect(screen.getByText('114 · An-Nâs')).toBeInTheDocument()
  })

  it('filtre par fragment de nom', async () => {
    render(<SelecteurSourate valeur={null} onChange={vi.fn()} />)
    const utilisateur = await ouvrir()

    await utilisateur.type(screen.getByPlaceholderText(/numéro, nom/i), 'baqar')

    expect(screen.getByText('2 · Al-Baqara')).toBeInTheDocument()
    expect(screen.queryByText('1 · Al-Fâtiha')).not.toBeInTheDocument()
  })

  it('filtre par numéro', async () => {
    render(<SelecteurSourate valeur={null} onChange={vi.fn()} />)
    const utilisateur = await ouvrir()

    await utilisateur.type(screen.getByPlaceholderText(/numéro, nom/i), '36')

    expect(screen.getByText('36 · Yâ-Sîn')).toBeInTheDocument()
    expect(screen.queryByText('2 · Al-Baqara')).not.toBeInTheDocument()
  })

  it('filtre par nom sans accent', async () => {
    render(<SelecteurSourate valeur={null} onChange={vi.fn()} />)
    const utilisateur = await ouvrir()

    await utilisateur.type(screen.getByPlaceholderText(/numéro, nom/i), 'imran')

    expect(screen.getByText("3 · Âl-'Imrân")).toBeInTheDocument()
  })

  it('signale l’absence de résultat', async () => {
    render(<SelecteurSourate valeur={null} onChange={vi.fn()} />)
    const utilisateur = await ouvrir()

    await utilisateur.type(screen.getByPlaceholderText(/numéro, nom/i), 'zzzzz')

    expect(screen.getByText('Aucune sourate trouvée.')).toBeInTheDocument()
  })

  it('remonte le numéro ET le nom canonique à la sélection', async () => {
    const onChange = vi.fn()
    render(<SelecteurSourate valeur={null} onChange={onChange} />)
    const utilisateur = await ouvrir()

    await utilisateur.type(screen.getByPlaceholderText(/numéro, nom/i), 'baqar')
    await utilisateur.click(screen.getByText('2 · Al-Baqara'))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ numero: 2, nom: 'Al-Baqara' })
    )
  })

  it('permet d’effacer la sélection — le champ reste facultatif', async () => {
    const onChange = vi.fn()
    render(<SelecteurSourate valeur={2} onChange={onChange} />)
    const utilisateur = await ouvrir()

    await utilisateur.click(screen.getByText('Effacer la sélection'))

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('n’offre pas d’effacer quand rien n’est sélectionné', async () => {
    render(<SelecteurSourate valeur={null} onChange={vi.fn()} />)

    await ouvrir()

    expect(screen.queryByText('Effacer la sélection')).not.toBeInTheDocument()
  })

  it('affiche la saisie ancienne non reconnue plutôt que de l’escamoter', () => {
    render(<SelecteurSourate valeur={null} onChange={vi.fn()} texteOrphelin="sourate 2 bis" />)

    expect(screen.getByText(/sourate 2 bis/)).toBeInTheDocument()
  })

  it('masque la saisie ancienne dès qu’une sourate est choisie', () => {
    render(<SelecteurSourate valeur={2} onChange={vi.fn()} texteOrphelin="sourate 2 bis" />)

    expect(screen.queryByText(/sourate 2 bis/)).not.toBeInTheDocument()
  })
})
