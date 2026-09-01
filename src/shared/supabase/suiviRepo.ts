import { getSupabaseClientPublic } from '@/shared/supabase/client'
import { ErreurSupabase } from '@/shared/supabase/erreurs'
import { suiviApprenantSchema, type SuiviApprenant } from '@/shared/supabase/suiviSchema'

/**
 * Lecture du suivi d'un apprenant par son jeton — couche repository
 * (CLAUDE.md §3), **deuxième** point d'accès non authentifié de l'application
 * après `coursPublicRepo`.
 *
 * Mêmes trois particularités que lui :
 *
 * 1. il passe par le client anonyme (`getSupabaseClientPublic`), sans session ;
 * 2. il n'atteint aucune table — le rôle `anon` n'a de droit que sur la
 *    fonction `public.suivi_apprenant()` (migration 0019) ;
 * 3. il **valide** la réponse avec Zod avant de la rendre, au lieu de faire
 *    confiance aux types générés.
 *
 * Aucun message d'erreur brut de Postgres ne ressort d'ici : cette page
 * s'adresse à un apprenant, pas à un développeur.
 */

/** Jeton mal formé : Postgres refuse la conversion en `uuid`. */
const CODE_UUID_INVALIDE = '22P02'

/** Le suivi, ou `null` si le jeton ne correspond à rien. */
export async function getParJeton(jeton: string): Promise<SuiviApprenant | null> {
  const { data, error } = await getSupabaseClientPublic()
    .rpc('suivi_apprenant', { p_jeton: jeton })
    .maybeSingle()

  if (error) {
    // Un jeton illisible n'est pas un incident : c'est un lien tronqué au
    // copier-coller. Même réponse qu'un jeton inconnu — et surtout, la même,
    // pour ne pas distinguer « mal formé » de « révoqué ».
    if (error.code === CODE_UUID_INVALIDE) return null

    /*
     * Tout le reste — serveur muet, coupure réseau, 5xx — est une PANNE, pas un
     * lien mort. La distinguer n'ouvre aucun oracle : elle ne dépend pas du
     * jeton, elle survient pareillement sur un lien valide et sur un lien
     * révoqué. Les confondre, en revanche, annonce à l'apprenant que son lien
     * est mort parce que le réseau a hoqueté.
     */
    throw new ErreurSupabase("Ce lien n'a pas pu être ouvert.", error)
  }

  if (!data) return null

  const resultat = suiviApprenantSchema.safeParse(data)

  if (!resultat.success) {
    throw new ErreurSupabase('Ce lien a renvoyé une réponse inattendue.')
  }

  return resultat.data
}
