import { lazy, Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'

import { LoginPage } from '@/features/auth/LoginPage'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { AppLayout } from '@/app/layout/AppLayout'
import { NotFoundPage } from '@/app/routes/NotFoundPage'

/**
 * Écrans métier chargés à la demande : chacun forme son propre chunk, ce qui
 * évite de servir toute l'application au premier écran (le `Suspense` qui les
 * accueille est posé autour de l'`Outlet` dans `AppLayout`).
 */
const PlanningPage = lazy(() =>
  import('@/features/planning/PlanningPage').then((module) => ({
    default: module.PlanningPage,
  }))
)
const CoursPage = lazy(() =>
  import('@/features/cours/CoursPage').then((module) => ({ default: module.CoursPage }))
)
const ApprenantsPage = lazy(() =>
  import('@/features/apprenants/ApprenantsPage').then((module) => ({
    default: module.ApprenantsPage,
  }))
)
const PaiementsPage = lazy(() =>
  import('@/features/paiements/PaiementsPage').then((module) => ({
    default: module.PaiementsPage,
  }))
)
const ParametresPage = lazy(() =>
  import('@/features/parametres/ParametresPage').then((module) => ({
    default: module.ParametresPage,
  }))
)
const SeancesSemainePage = lazy(() =>
  import('@/features/seances/SeancesSemainePage').then((module) => ({
    default: module.SeancesSemainePage,
  }))
)

/**
 * Page de cours partagée. Elle n'est pas rendue sous `AppLayout`, donc elle
 * porte son propre `Suspense`.
 */
const PageCoursPublic = lazy(() =>
  import('@/features/partage/PageCoursPublic').then((module) => ({
    default: module.PageCoursPublic,
  }))
)

function EcranAttente() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-dvh items-center justify-center gap-2 bg-background text-sm text-muted-foreground"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      Chargement…
    </div>
  )
}

/**
 * Rapport de fin de session — feuille imprimable. Comme la page de partage,
 * elle n'est pas rendue sous `AppLayout` : ni barre de navigation, ni pied de
 * page ne doivent atterrir sur le papier. Elle reste, elle, derrière
 * `RequireAuth`.
 */
const RapportSessionPage = lazy(() =>
  import('@/features/rapport/RapportSessionPage').then((module) => ({
    default: module.RapportSessionPage,
  }))
)

/**
 * Routes de l'application.
 *
 * Deux écrans seulement échappent à `RequireAuth` : `/login`, et `/c/:jeton`,
 * la page de cours partagée — destinée à des apprenants qui n'ont pas de compte
 * et n'en auront pas. Tout le reste exige une session.
 */
const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/c/:jeton',
    element: (
      <Suspense fallback={<EcranAttente />}>
        <PageCoursPublic />
      </Suspense>
    ),
  },
  {
    element: <RequireAuth />,
    children: [
      {
        // Hors `AppLayout` : le rapport occupe la feuille entière.
        path: '/cours/:coursId/rapport',
        element: (
          <Suspense fallback={<EcranAttente />}>
            <RapportSessionPage />
          </Suspense>
        ),
      },
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { index: true, element: <PlanningPage /> },
          { path: 'cours', element: <CoursPage /> },
          { path: 'seances', element: <SeancesSemainePage /> },
          { path: 'apprenants', element: <ApprenantsPage /> },
          { path: 'paiements', element: <PaiementsPage /> },
          { path: 'parametres', element: <ParametresPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
