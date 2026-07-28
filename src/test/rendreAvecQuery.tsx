import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'

/**
 * Rend un composant sous un `QueryClientProvider` neuf.
 *
 * Utile pour les écrans dont on mocke les hooks principaux mais qui montent des
 * composants secondaires appelant `useQuery` : sans provider, React Query lève.
 * Les requêtes réellement déclenchées restent inoffensives (elles sont
 * `enabled: false` faute d'identifiant), et `retry: false` évite toute attente.
 */
export function rendreAvecQuery(ui: ReactElement, options?: RenderOptions): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>, options)
}
