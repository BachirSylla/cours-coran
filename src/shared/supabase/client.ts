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

function lireConfiguration(): { url: string; anonKey: string } {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'Configuration Supabase manquante : renseignez VITE_SUPABASE_URL et ' +
        'VITE_SUPABASE_ANON_KEY dans un fichier .env.local (voir .env.example).'
    )
  }

  return { url, anonKey }
}

export function getSupabaseClient(): CoursCoranClient {
  if (client) return client

  const { url, anonKey } = lireConfiguration()

  client = createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })

  return client
}

let clientPublic: CoursCoranClient | undefined

/**
 * Client **anonyme**, réservé à la page de cours partagée (`/c/:jeton`).
 *
 * Un apprenant n'a pas de compte : ce client ne persiste aucune session, n'en
 * rafraîchit aucune et n'inspecte pas l'URL (le jeton de partage n'a rien à voir
 * avec un jeton d'authentification). Il ne touche donc jamais le stockage
 * d'auth du navigateur.
 *
 * `storageKey` distinct malgré `persistSession: false` : sans lui, supabase-js
 * signale deux instances GoTrue partageant le même espace lorsque l'enseignant
 * ouvre le lien depuis son propre navigateur.
 *
 * Il n'accorde aucun droit supplémentaire : le rôle `anon` ne peut appeler que
 * `public.cours_public()` (migration 0007).
 */
export function getSupabaseClientPublic(): CoursCoranClient {
  if (clientPublic) return clientPublic

  const { url, anonKey } = lireConfiguration()

  clientPublic = createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'cours-coran:public',
    },
  })

  return clientPublic
}

/** Indique si les variables d'environnement Supabase sont présentes. */
export function isSupabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
}
