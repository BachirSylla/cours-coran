import { useCallback, useState } from 'react'

/**
 * Ouvre le dialogue d'impression une fois la page réellement **peinte**.
 *
 * `window.print()` est synchrone et bloquant : tout ce que React n'a pas encore
 * commité au DOM au moment de l'appel n'atteindra pas le papier. D'où l'attente
 * en deux temps :
 *
 * 1. `document.fonts.ready` — sans effet aujourd'hui (l'application n'embarque
 *    aucune police), mais le jour où l'on en ajoute une, le rapport sortirait
 *    sinon avec les métriques de la police de secours : colonnes décalées.
 *    L'accès optionnel couvre jsdom, qui n'implémente pas `FontFaceSet` ;
 * 2. deux `requestAnimationFrame` imbriqués : le premier rappel est planifié
 *    avant la peinture de la frame courante, le second s'exécute après. C'est
 *    le seul moyen portable de savoir que le navigateur a peint.
 */
export function useImpression(): { imprimer: () => Promise<void>; enCours: boolean } {
  const [enCours, setEnCours] = useState(false)

  const imprimer = useCallback(async () => {
    setEnCours(true)
    try {
      await document.fonts?.ready
      await new Promise<void>((resoudre) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resoudre()))
      })
      window.print()
    } finally {
      // `print()` ne rend la main qu'à la fermeture de l'aperçu.
      setEnCours(false)
    }
  }, [])

  return { imprimer, enCours }
}
