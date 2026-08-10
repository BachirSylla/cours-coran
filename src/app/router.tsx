import { lazy } from 'react'
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
 * Routes de l'application.
 * `/login` est le seul écran public : tout le reste passe par `RequireAuth`.
 */
const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
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
