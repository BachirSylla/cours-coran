import { Suspense } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  Loader2,
  LogOut,
  Moon,
  Settings,
  Sun,
  Users,
  Wallet,
} from 'lucide-react'

import { useAuth } from '@/features/auth/useAuth'
import { useMembre } from '@/features/membres/hooks/useMembre'
import { cn } from '@/shared/lib/utils'
import { useTheme } from '@/shared/lib/useTheme'
import { Button } from '@/shared/ui/button'
import { PwaInstallPrompt } from '@/shared/ui/PwaInstallPrompt'

/**
 * Navigation principale.
 *
 * `responsable: true` retire l'entrée pour un enseignant. La RLS lui refuse déjà
 * la table `paiement` — il verrait une page vide plutôt qu'une erreur, ce qui
 * est pire qu'un onglet absent (migration 0012).
 */
const NAVIGATION = [
  { to: '/', libelle: 'Planning', icone: CalendarDays, exact: true, responsable: false },
  { to: '/cours', libelle: 'Cours', icone: BookOpen, exact: false, responsable: false },
  {
    to: '/seances',
    libelle: 'Séances',
    icone: CalendarCheck,
    exact: false,
    responsable: false,
  },
  { to: '/apprenants', libelle: 'Apprenants', icone: Users, exact: false, responsable: false },
  { to: '/paiements', libelle: 'Paiements', icone: Wallet, exact: false, responsable: true },
] as const

export function AppLayout() {
  const { theme, toggleTheme } = useTheme()
  const { user, signOut } = useAuth()
  const { estResponsable, chargement } = useMembre()

  // Tant que le rôle n'est pas connu, on n'affiche pas l'onglet réservé : mieux
  // vaut le voir apparaître que le voir disparaître.
  const navigation = NAVIGATION.filter(
    (entree) => !entree.responsable || (estResponsable && !chargement)
  )

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookOpen className="size-5" aria-hidden="true" />
          </span>

          <div className="min-w-0">
            <p className="truncate text-base leading-tight font-semibold tracking-tight">
              Cours Coran
            </p>
            <p className="truncate text-xs leading-tight text-muted-foreground">
              Planning, apprenants et séances
            </p>
          </div>

          <div className="ml-auto flex items-center gap-1">
            {user?.email && (
              <span className="mr-1 hidden max-w-[14rem] truncate text-xs text-muted-foreground sm:inline">
                {user.email}
              </span>
            )}

            <Button
              variant="ghost"
              size="icon"
              asChild
              aria-label="Paramètres"
              title="Paramètres"
            >
              <Link to="/parametres">
                <Settings className="size-4" aria-hidden="true" />
              </Link>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
            >
              {theme === 'dark' ? (
                <Sun className="size-4" aria-hidden="true" />
              ) : (
                <Moon className="size-4" aria-hidden="true" />
              )}
            </Button>

            {/* La redirection vers /login est assurée par RequireAuth dès que
                le statut passe à « deconnecte ». */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void signOut()}
              aria-label="Se déconnecter"
              title="Se déconnecter"
            >
              <LogOut className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <nav
          aria-label="Navigation principale"
          className="mx-auto flex w-full max-w-6xl items-center gap-1 overflow-x-auto px-2 pb-2 sm:px-4"
        >
          {navigation.map(({ to, libelle, icone: Icone, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )
              }
            >
              <Icone className="size-4" aria-hidden="true" />
              {libelle}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {/* Les écrans métier sont chargés à la demande (voir app/router.tsx). */}
        <Suspense
          fallback={
            <div
              role="status"
              aria-live="polite"
              className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Chargement…
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      <footer className="border-t">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 text-xs text-muted-foreground sm:px-6">
          Cours Coran — échafaudage MVP
        </div>
      </footer>

      <PwaInstallPrompt />
    </div>
  )
}
