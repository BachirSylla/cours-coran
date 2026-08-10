import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Démonte les composants montés entre chaque test.
afterEach(() => {
  cleanup()
})

/**
 * jsdom n'implémente ni `ResizeObserver` ni `scrollIntoView`, dont dépendent
 * les composants shadcn/ui bâtis sur cmdk et Radix (sélecteurs de sourate et
 * d'apprenant). Sans ces bouchons, ouvrir un popover lève une ReferenceError
 * qui n'a rien à voir avec le comportement testé.
 */
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {}
}
