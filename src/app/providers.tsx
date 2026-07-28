import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { AuthProvider } from '@/features/auth/AuthProvider'

/**
 * Fournisseurs globaux de l'application.
 * Toute donnée serveur passe par TanStack Query (CLAUDE.md §9).
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  })
}

export function AppProviders({ children }: { children: ReactNode }) {
  // Une instance par montage : évite de partager le cache entre deux rendus/tests.
  const [queryClient] = useState(createQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      {/* AuthProvider est à l'intérieur : il vide le cache Query à la déconnexion. */}
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  )
}
