import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'

import * as authService from '@/features/auth/authService'
import {
  AuthContext,
  type AuthContextValue,
  type StatutAuth,
} from '@/features/auth/authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [statut, setStatut] = useState<StatutAuth>('chargement')
  const utilisateurPrecedent = useRef<string | null>(null)

  useEffect(() => {
    let monte = true

    function appliquer(nouvelleSession: Session | null) {
      if (!monte) return

      const idUtilisateur = nouvelleSession?.user.id ?? null

      // Une requête partie avant que la session ne soit posée revient vide (RLS
      // filtre tout sans lever d'erreur) et resterait en cache. À chaque
      // connexion, on refetch donc tout ce qui a pu être lu auparavant.
      if (idUtilisateur && idUtilisateur !== utilisateurPrecedent.current) {
        void queryClient.invalidateQueries()
      }
      utilisateurPrecedent.current = idUtilisateur

      setSession(nouvelleSession)
      setStatut(nouvelleSession ? 'connecte' : 'deconnecte')
    }

    // On s'abonne d'abord : aucun changement d'état ne peut ainsi passer entre
    // la lecture initiale et la mise en place de l'écoute.
    const desabonner = authService.onAuthStateChange(appliquer)

    authService
      .getSession()
      .then(appliquer)
      .catch(() => {
        // Session illisible (stockage corrompu, configuration absente) :
        // on considère l'utilisateur déconnecté plutôt que de rester bloqué.
        if (monte) setStatut('deconnecte')
      })

    return () => {
      monte = false
      desabonner()
    }
  }, [queryClient])

  const signIn = useCallback(async (email: string, motDePasse: string) => {
    const nouvelleSession = await authService.signIn(email, motDePasse)
    setSession(nouvelleSession)
    setStatut('connecte')
  }, [])

  const signOut = useCallback(async () => {
    await authService.signOut()
    setSession(null)
    setStatut('deconnecte')
    // Les données mises en cache appartiennent à la session qui vient de se
    // terminer : elles ne doivent pas réapparaître à la prochaine connexion.
    queryClient.clear()
  }, [queryClient])

  const valeur = useMemo<AuthContextValue>(
    () => ({ session, user: session?.user ?? null, statut, signIn, signOut }),
    [session, statut, signIn, signOut]
  )

  return <AuthContext.Provider value={valeur}>{children}</AuthContext.Provider>
}
