import { Loader2 } from 'lucide-react'
import { Outlet } from 'react-router'

import { useMembre } from '@/features/membres/hooks/useMembre'
import { RejoindreCentrePage } from '@/features/membres/RejoindreCentrePage'

/**
 * Garde d'appartenance : sous `RequireAuth`, tout ce qui est rendu en dessous
 * exige d'appartenir à un centre.
 *
 * L'inscription étant ouverte (migration 0016), un compte peut exister sans
 * ligne `membre`. Il est alors **inerte** — `centre_courant()` vaut `null`,
 * donc la RLS ne lui montre rien. Sans cette garde il verrait une application
 * entièrement vide, qui se lit comme une panne. On l'accueille plutôt.
 *
 * L'écran de rachat est rendu **à la place** de l'`Outlet`, sans `Navigate` :
 * l'URL demandée est préservée, et l'application ne gagne pas une route
 * publique de plus.
 *
 * Non-régression : un compte déjà membre — c'est-à-dire tous les comptes
 * existants — ne traverse jamais cette branche.
 */
export function RequireMembre() {
  const { membre, chargement } = useMembre()

  if (chargement) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background"
      >
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    )
  }

  if (membre === null) {
    return <RejoindreCentrePage />
  }

  return <Outlet />
}
