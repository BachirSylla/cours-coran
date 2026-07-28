import type { Session } from '@supabase/supabase-js'

import { getSupabaseClient } from '@/shared/supabase/client'

/**
 * Service d'authentification — **seule** couche autorisée à toucher
 * `supabase.auth` (CLAUDE.md §3, §9). Le reste de l'application passe par
 * `useAuth()`.
 *
 * L'application est mono-utilisateur : un unique compte enseignant, créé à la
 * main dans le dashboard Supabase. Il n'y a donc volontairement **aucune
 * fonction d'inscription** ici.
 */

/** Traduit les messages d'erreur GoTrue, qui sont en anglais et peu explicites. */
function messageErreur(message: string): string {
  const normalise = message.toLowerCase()

  if (normalise.includes('invalid login credentials')) {
    return 'E-mail ou mot de passe incorrect.'
  }
  if (normalise.includes('email not confirmed')) {
    return "Ce compte n'est pas confirmé. Dans le dashboard Supabase, recréez l'utilisateur avec l'option « Auto Confirm User »."
  }
  if (normalise.includes('failed to fetch') || normalise.includes('network')) {
    return 'Connexion au serveur impossible. Vérifiez votre connexion internet.'
  }
  if (normalise.includes('too many requests') || normalise.includes('rate limit')) {
    return 'Trop de tentatives. Patientez quelques instants avant de réessayer.'
  }

  return message
}

export async function signIn(email: string, motDePasse: string): Promise<Session> {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({
    email,
    password: motDePasse,
  })

  if (error) {
    throw new Error(messageErreur(error.message))
  }
  if (!data.session) {
    throw new Error('Connexion impossible : aucune session renvoyée par Supabase.')
  }

  return data.session
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signOut()

  if (error) {
    throw new Error(messageErreur(error.message))
  }
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await getSupabaseClient().auth.getSession()

  if (error) {
    throw new Error(messageErreur(error.message))
  }

  return data.session
}

/**
 * Abonne `callback` aux changements de session (connexion, déconnexion,
 * rafraîchissement de jeton, expiration).
 *
 * @returns la fonction de désabonnement, à appeler au démontage.
 */
export function onAuthStateChange(callback: (session: Session | null) => void): () => void {
  const { data } = getSupabaseClient().auth.onAuthStateChange((_evenement, session) => {
    callback(session)
  })

  return () => {
    data.subscription.unsubscribe()
  }
}
