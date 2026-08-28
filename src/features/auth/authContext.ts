import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

/**
 * `chargement` : la session initiale n'est pas encore résolue — ne rien afficher
 * qui dépende de l'authentification, sous peine de flash de contenu.
 */
export type StatutAuth = 'chargement' | 'connecte' | 'deconnecte'

export interface AuthContextValue {
  session: Session | null
  user: User | null
  statut: StatutAuth
  signIn: (email: string, motDePasse: string) => Promise<void>
  /** Crée un compte et ouvre la session. Le compte est inerte tant qu'il n'a
   *  pas échangé un code d'invitation (migration 0016). */
  signUp: (email: string, motDePasse: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
