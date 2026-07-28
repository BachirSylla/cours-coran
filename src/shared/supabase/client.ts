import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/shared/supabase/types'

/**
 * Point d'entrée unique vers Supabase, typé par le schéma généré
 * (`npm run gen:types` → `src/shared/supabase/types.ts`).
 *
 * Le client est créé **paresseusement** : tant qu'aucun repository ne l'appelle,
 * l'application démarre sans `.env.local`.
 *
 * Règle CLAUDE.md §3 : seuls les repositories (`src/shared/supabase/*Repo.ts`)
 * importent ce module — jamais un composant ni un hook de feature directement.
 */
export type CoursCoranClient = SupabaseClient<Database>

let client: CoursCoranClient | undefined

export function getSupabaseClient(): CoursCoranClient {
  if (client) return client

  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'Configuration Supabase manquante : renseignez VITE_SUPABASE_URL et ' +
        'VITE_SUPABASE_ANON_KEY dans un fichier .env.local (voir .env.example).'
    )
  }

  client = createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })

  return client
}

/** Indique si les variables d'environnement Supabase sont présentes. */
export function isSupabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
}
