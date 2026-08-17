import { getSupabaseClientPublic } from '@/shared/supabase/client'
import { coursPublicSchema, type CoursPublic } from '@/shared/supabase/coursPublicSchema'
import { ErreurSupabase } from '@/shared/supabase/erreurs'

/**
 * Lecture publique d'un cours par son jeton de partage — couche repository
 * (CLAUDE.md §3), seul point d'accès **non authentifié** de l'application.
 *
 * Trois particularités par rapport aux autres repositories :
 *
 * 1. il passe par le client anonyme (`getSupabaseClientPublic`), sans session ;
 * 2. il n'atteint aucune table — le rôle `anon` n'a de droit que sur la fonction
 *    `public.cours_public()` (migration 0007) ;
 * 3. il **valide** la réponse avec Zod avant de la rendre, au lieu de faire
 *    confiance aux types générés.
 *
 * Aucun message d'erreur brut de Postgres ne ressort d'ici : la page publique
 * s'adresse à un apprenant, pas à un développeur.
 */

/** Jeton mal formé : Postgres refuse la conversion en `uuid`. */
const CODE_UUID_INVALIDE = '22P02'

/** Le cours partagé, ou `null` si le jeton ne correspond à rien. */
export async function getParJeton(jeton: string): Promise<CoursPublic | null> {
  const { data, error } = await getSupabaseClientPublic()
    .rpc('cours_public', { jeton })
    .maybeSingle()

  if (error) {
    // Un jeton illisible n'est pas un incident : c'est un lien tronqué au
    // copier-coller. Même réponse qu'un jeton inconnu — et surtout, la même,
    // pour ne pas distinguer « mal formé » de « révoqué ».
    if (error.code === CODE_UUID_INVALIDE) return null

    throw new ErreurSupabase("Ce lien n'a pas pu être ouvert.", error)
  }

  if (!data) return null

  const resultat = coursPublicSchema.safeParse(data)

  if (!resultat.success) {
    throw new ErreurSupabase('Ce lien a renvoyé une réponse inattendue.')
  }

  return resultat.data
}
