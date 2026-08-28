import { getSupabaseClient } from '@/shared/supabase/client'
import { lancerSiErreur } from '@/shared/supabase/erreurs'
import type { Database } from '@/shared/supabase/types'

/**
 * Appartenance à un centre et rôle qui y est tenu (migration 0012).
 *
 * Le rôle vit **côté serveur**, dans cette table : il n'est ni dans le jeton, ni
 * dans un réglage local, et n'est donc pas falsifiable depuis le navigateur. Ce
 * que ce repository ramène ne sert qu'à **présenter** l'interface — masquer ce
 * qui serait de toute façon refusé. Les policies RLS restent la seule autorité :
 * un client modifié verrait les boutons, et ses écritures échoueraient quand
 * même.
 */
type TableMembre = Database['public']['Tables']['membre']

export type Membre = TableMembre['Row']

/** Les deux rôles du lot 1 (`membre.role` est du `text`, contraint en base). */
export type RoleMembre = 'responsable' | 'enseignant'

export function estRole(valeur: string): valeur is RoleMembre {
  return valeur === 'responsable' || valeur === 'enseignant'
}

/**
 * L'appartenance du compte connecté, ou `null` s'il n'en a aucune.
 *
 * Le filtre sur `user_id` est nécessaire : la RLS laisse un membre voir **tous**
 * les membres de son centre, ce qui est voulu (choisir un enseignant à qui
 * affecter un cours).
 */
export async function getCourant(userId: string): Promise<Membre | null> {
  const { data, error } = await getSupabaseClient()
    .from('membre')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  lancerSiErreur(error, 'Chargement de votre rôle')

  return data
}

/** Les membres du centre, pour affecter un cours à un enseignant. */
export async function list(): Promise<Membre[]> {
  const { data, error } = await getSupabaseClient()
    .from('membre')
    .select('*')
    .order('nom_affiche', { ascending: true })

  lancerSiErreur(error, 'Chargement des membres du centre')

  return data ?? []
}

/**
 * Barème de récitation propre à l'utilisateur connecté (migration 0012).
 *
 * C'est la **seule** colonne de `membre` qu'un client peut écrire : `role` et
 * `centre_id` ne sont accordés à personne en écriture, de sorte que la policy
 * « je modifie ma propre ligne » ne puisse pas devenir une escalade de
 * privilège.
 */
export async function definirBareme(userId: string, bareme: number): Promise<Membre> {
  const { data, error } = await getSupabaseClient()
    .from('membre')
    .update({ note_bareme: bareme })
    .eq('user_id', userId)
    .select('*')
    .single()

  lancerSiErreur(error, 'Enregistrement du barème')

  return data
}
