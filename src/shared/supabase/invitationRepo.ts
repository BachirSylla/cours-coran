import { getSupabaseClient } from '@/shared/supabase/client'
import { ErreurSupabase, lancerSiErreur } from '@/shared/supabase/erreurs'
import type { Database } from '@/shared/supabase/types'

/**
 * Invitations d'enseignants (migration 0016) — couche repository (CLAUDE.md §3).
 *
 * Les trois écritures passent par des RPC `security definer` : la table
 * n'accorde le `insert`, l'`update` ni le `delete` à personne. C'est ce qui rend
 * les garde-fous inévitables plutôt que simplement présents — et ce qui garantit
 * que ni le centre ni le rôle ne peuvent venir du navigateur.
 */
type TableInvitation = Database['public']['Tables']['invitation']

/**
 * Une invitation telle qu'un responsable la voit.
 *
 * `code_hash` en est **absent**, et pas seulement par discrétion : la colonne
 * n'est accordée à personne en lecture, pas même à celui qui a créé
 * l'invitation. L'empreinte ne sort jamais de la base.
 */
export type Invitation = Omit<TableInvitation['Row'], 'code_hash'>

/** Les colonnes lisibles, énumérées : `select('*')` échouerait sur `code_hash`. */
const COLONNES =
  'id, centre_id, role, cree_par, expire_le, utilise_le, utilise_par, revoquee_le, created_at, updated_at'

/**
 * État d'une invitation — **déduit**, jamais stocké (CLAUDE.md §4). Le figer en
 * colonne le rendrait faux tout seul au passage de l'expiration.
 */
export type EtatInvitation = 'active' | 'utilisee' | 'revoquee' | 'expiree'

export function etatInvitation(
  invitation: Invitation,
  maintenant = new Date()
): EtatInvitation {
  if (invitation.utilise_le !== null) return 'utilisee'
  if (invitation.revoquee_le !== null) return 'revoquee'
  if (new Date(invitation.expire_le) <= maintenant) return 'expiree'

  return 'active'
}

/** Les invitations du centre, la plus récente en tête. Responsable uniquement. */
export async function list(): Promise<Invitation[]> {
  const { data, error } = await getSupabaseClient()
    .from('invitation')
    .select(COLONNES)
    .order('created_at', { ascending: false })

  lancerSiErreur(error, 'Chargement des invitations')

  return data ?? []
}

/**
 * Crée une invitation et renvoie le code **en clair**.
 *
 * C'est sa seule et unique apparition : la base n'en garde qu'une empreinte
 * SHA-256. Perdu, il ne se retrouve pas — il faut révoquer et réémettre.
 *
 * Ni le centre ni le rôle ne sont des paramètres : le serveur les pose.
 */
export async function creer(jours = 7): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc('creer_invitation', { p_jours: jours })

  lancerSiErreur(error, "Création de l'invitation")

  if (!data) {
    throw new ErreurSupabase("Création de l'invitation : aucun code renvoyé.")
  }

  return data
}

/**
 * Échange un code contre l'appartenance au centre qu'il porte.
 *
 * @returns le nom du centre rejoint, pour pouvoir le nommer à l'écran.
 */
export async function racheter(code: string, nomAffiche: string): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc('racheter_invitation', {
    p_code: code,
    p_nom_affiche: nomAffiche,
  })

  lancerSiErreur(error, 'Rachat du code')

  return data ?? 'votre centre'
}

/** Rend une invitation non utilisée définitivement non rachetable. */
export async function revoquer(id: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('revoquer_invitation', { p_id: id })

  lancerSiErreur(error, "Révocation de l'invitation")
}
