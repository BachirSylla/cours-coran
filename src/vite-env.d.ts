/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** URL du projet Supabase — voir .env.example */
  readonly VITE_SUPABASE_URL?: string
  /** Clé anonyme (publique) du projet Supabase — voir .env.example */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
