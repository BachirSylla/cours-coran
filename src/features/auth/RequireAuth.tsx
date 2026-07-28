import { Loader2 } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router'

import { useAuth } from '@/features/auth/useAuth'

/**
 * Garde de route : tout ce qui est rendu en dessous exige une session.
 *
 * Tant que la session initiale n'est pas résolue (`chargement`), on affiche un
 * écran d'attente — sans quoi l'application redirigerait vers `/login` à chaque
 * rechargement, le temps que Supabase relise le jeton stocké.
 */
export function RequireAuth() {
  const { statut } = useAuth()
  const location = useLocation()

  if (statut === 'chargement') {
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

  if (statut === 'deconnecte') {
    // `from` permet à LoginPage de renvoyer l'enseignant là où il voulait aller.
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}
