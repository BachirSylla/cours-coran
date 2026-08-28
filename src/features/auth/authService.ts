import type { Session } from '@supabase/supabase-js'

import { getSupabaseClient } from '@/shared/supabase/client'

/**
 * Service d'authentification — **seule** couche autorisée à toucher
 * `supabase.auth` (CLAUDE.md §3, §9). Le reste de l'application passe par
 * `useAuth()`.
 *
 * L'inscription est **ouverte** depuis la migration 0016 : n'importe qui peut
 * créer un compte. Ce qui rend cela sans danger est l'inertie — un compte sans
 * ligne `membre` a `centre_courant() = null`, donc ne voit rien et n'écrit
 * rien. Il ne devient quelque chose qu'en échangeant un code d'invitation.
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
  if (
    normalise.includes('already registered') ||
    normalise.includes('already been registered')
  ) {
    return 'Un compte existe déjà avec cette adresse. Connectez-vous plutôt.'
  }
  if (normalise.includes('signups not allowed') || normalise.includes('signup is disabled')) {
    return 'La création de comptes est désactivée sur ce projet. Prévenez le responsable du centre.'
  }
  if (normalise.includes('password should be') || normalise.includes('weak password')) {
    return 'Mot de passe trop court : il faut au moins 6 caractères.'
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

/**
 * Crée un compte, et ouvre la session dans la foulée.
 *
 * La confirmation par e-mail est désactivée sur le projet (`mailer_autoconfirm`)
 * : l'adresse n'est ici qu'un identifiant de connexion, on ne lui envoie jamais
 * rien. Si elle était réactivée, Supabase ne renverrait pas de session — d'où
 * le message explicite plutôt qu'un échec muet.
 */
export async function signUp(email: string, motDePasse: string): Promise<Session> {
  const { data, error } = await getSupabaseClient().auth.signUp({
    email,
    password: motDePasse,
  })

  if (error) {
    throw new Error(messageErreur(error.message))
  }
  if (!data.session) {
    throw new Error('Compte créé. Confirmez votre adresse e-mail, puis connectez-vous.')
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
