import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SelecteurEtatPresence } from '@/features/seances/components/SelecteurEtatPresence'
import { ETATS_PRESENCE } from '@/shared/lib/rapport'

const onChoisir = vi.fn()

function rendre(valeur: Parameters<typeof SelecteurEtatPresence>[0]['valeur'] = 'present') {
  return render(
    <SelecteurEtatPresence valeur={valeur} nomComplet="Aïcha Diallo" onChoisir={onChoisir} />
  )
}

function selecteur() {
  return screen.getByRole('combobox', { name: 'État de présence de Aïcha Diallo' })
}

describe('SelecteurEtatPresence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('propose les cinq états dans l’ordre du domaine', () => {
    rendre()

    const options = within(selecteur()).getAllByRole('option')

    expect(options.map((option) => option.getAttribute('value'))).toEqual([...ETATS_PRESENCE])
    expect(options.map((option) => option.textContent)).toEqual([
      'Présent',
      'En retard',
      'Absent',
      'Absent (excusé)',
      'Présence partielle',
    ])
  })

  it('affiche l’état courant', () => {
    rendre('excuse')

    expect(selecteur()).toHaveValue('excuse')
  })

  it('remonte l’état choisi', async () => {
    const utilisateur = userEvent.setup()
    rendre()

    await utilisateur.selectOptions(selecteur(), 'retard')

    expect(onChoisir).toHaveBeenCalledExactlyOnceWith('retard')
  })

  it('porte un libellé nommant l’apprenant', () => {
    // Une liste en compte une par apprenant : sans le nom, un lecteur d'écran
    // annoncerait cinq fois « État de présence ».
    rendre()

    expect(selecteur()).toHaveAccessibleName('État de présence de Aïcha Diallo')
  })

  it('se désactive et n’écrit plus', async () => {
    const utilisateur = userEvent.setup()
    render(
      <SelecteurEtatPresence
        valeur="present"
        nomComplet="Aïcha Diallo"
        onChoisir={onChoisir}
        desactive
      />
    )

    expect(selecteur()).toBeDisabled()
    await utilisateur.selectOptions(selecteur(), 'absent').catch(() => undefined)
    expect(onChoisir).not.toHaveBeenCalled()
  })
})
