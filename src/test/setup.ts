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

/**
 * Le déclencheur d'un `Select` Radix relâche la capture de pointeur au
 * `pointerdown`, avant toute autre chose :
 *
 *     if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(…)
 *
 * jsdom n'implémente aucune des trois méthodes de capture, si bien qu'un
 * `userEvent.click` sur un tel déclencheur lève une TypeError avant même
 * d'ouvrir le menu. Répondre « je ne détiens pas la capture » suffit : Radix ne
 * relâche que ce qu'il détient.
 */
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = function hasPointerCapture() {
    return false
  }
  Element.prototype.setPointerCapture = function setPointerCapture() {}
  Element.prototype.releasePointerCapture = function releasePointerCapture() {}
}

/**
 * jsdom n'implémente pas non plus `matchMedia`, dont dépend `useTheme` pour lire
 * la préférence système. La page de cours partagée l'appelle : elle n'est pas
 * rendue sous `AppLayout`, donc elle pose elle-même la classe `dark`.
 * Le bouchon répond « thème clair », ce qui n'influe sur aucune assertion.
 */
if (!window.matchMedia) {
  window.matchMedia = (media: string) =>
    ({
      media,
      matches: false,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
