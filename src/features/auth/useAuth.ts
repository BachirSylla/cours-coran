import { useContext } from 'react'

import { AuthContext, type AuthContextValue } from '@/features/auth/authContext'

/** Accès à la session de l'enseignant. À utiliser sous `<AuthProvider>`. */
export function useAuth(): AuthContextValue {
  const valeur = useContext(AuthContext)

  if (!valeur) {
    throw new Error('useAuth() doit être utilisé à l’intérieur de <AuthProvider>.')
  }

  return valeur
}
