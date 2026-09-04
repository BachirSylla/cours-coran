import { lazy, Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'

import { LoginPage } from '@/features/auth/LoginPage'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { RequireMembre } from '@/features/membres/RequireMembre'
import { AppLayout } from '@/app/layout/AppLayout'
import { NotFoundPage } from '@/app/routes/NotFoundPage'

/**
 * Écrans métier chargés à la demande : chacun forme son propre chunk, ce qui
 * évite de servir toute l'application au premier écran (le `Suspense` qui les
 * accueille est posé autour de l'`Outlet` dans `AppLayout`).
 */
const TableauDeBordPage = lazy(() =>
  import('@/features/tableauDeBord/TableauDeBordPage').then((module) => ({
    default: module.TableauDeBordPage,
  }))
)

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

/**
 * Suivi privé d'un apprenant. Même régime que la page de cours partagée : sans
 * compte, sans `AppLayout`, donc avec son propre `Suspense`.
 */
const PageSuivi = lazy(() =>
  import('@/features/suivi/PageSuivi').then((module) => ({ default: module.PageSuivi }))
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
 * Trois écrans seulement échappent à `RequireAuth` : `/login`, `/c/:jeton` — la
 * page de cours partagée — et `/suivi/:jeton` — le suivi privé d'un apprenant.
 * Les deux dernières sont destinées à des apprenants qui n'ont pas de compte et
 * n'en auront pas. Tout le reste exige une session.
 *
 * Sous `RequireAuth`, `RequireMembre` exige en plus d'appartenir à un centre :
 * l'inscription étant ouverte (migration 0016), un compte peut exister sans
 * rattachement. Il n'ajoute aucune route — il substitue son écran à l'`Outlet`.
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
    path: '/suivi/:jeton',
    element: (
      <Suspense fallback={<EcranAttente />}>
        <PageSuivi />
      </Suspense>
    ),
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <RequireMembre />,
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
              { index: true, element: <TableauDeBordPage /> },
              { path: 'planning', element: <PlanningPage /> },
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
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
