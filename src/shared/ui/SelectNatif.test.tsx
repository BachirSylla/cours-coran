import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { SelectNatif } from '@/shared/ui/SelectNatif'

function rendre(props: Partial<React.ComponentProps<typeof SelectNatif>> = {}) {
  return render(
    <SelectNatif aria-label="Barème" defaultValue="20" {...props}>
      <option value="10">/10</option>
      <option value="20">/20</option>
    </SelectNatif>
  )
}

const selecteur = () => screen.getByRole('combobox', { name: 'Barème' })

describe('SelectNatif', () => {
  it('rend un select avec ses options', () => {
    rendre()

    expect(selecteur()).toHaveValue('20')
    expect(within(selecteur()).getAllByRole('option')).toHaveLength(2)
  })

  it('remonte le choix', async () => {
    const onChange = vi.fn()
    const utilisateur = userEvent.setup()
    rendre({ onChange })

    await utilisateur.selectOptions(selecteur(), '10')

    expect(onChange).toHaveBeenCalledOnce()
  })

  /**
   * Le fond doit rester **opaque**. Un `background-color` transparent — ou
   * translucide, comme le `dark:bg-input/30` du composant `Input` — fait peindre
   * la liste d'options sur du blanc par Chrome, tandis que le texte hérite du
   * `color` du select : blanc sur blanc en thème sombre. C'est le bug qui a
   * motivé ce composant.
   *
   * L'assertion ne couvre que la base : une classe passée par l'appelant
   * l'emporterait via tailwind-merge. C'est pour cela que la règle est écrite
   * dans la docstring du composant, et pas seulement ici.
   */
  it('garde un fond opaque et des options colorées', () => {
    rendre()

    const classes = selecteur().className

    expect(classes).toContain('bg-background')
    expect(classes).not.toContain('bg-transparent')
    expect(classes).toContain('[&_option]:bg-popover')
  })

  it('accepte des classes supplémentaires sans perdre les siennes', () => {
    rendre({ className: 'h-8 text-xs' })

    expect(selecteur().className).toContain('h-8')
    expect(selecteur().className).toContain('[&_option]:bg-popover')
  })

  it('se désactive', () => {
    rendre({ disabled: true })

    expect(selecteur()).toBeDisabled()
  })
})
