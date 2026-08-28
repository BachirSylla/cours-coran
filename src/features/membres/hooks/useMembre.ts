import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import * as membreRepo from '@/shared/supabase/membreRepo'
import { estRole, type Membre, type RoleMembre } from '@/shared/supabase/membreRepo'

export const membreKeys = {
  tous: ['membre'] as const,
  courant: (userId: string | null) => [...membreKeys.tous, 'courant', userId] as const,
}

export interface MembreCourant {
  membre: Membre | null
  centreId: string | null
  role: RoleMembre | null
  /** Vrai seulement pour un responsable **confirmé** — voir la note ci-dessous. */
  estResponsable: boolean
  /** L'appartenance n'est pas encore connue : ne rien décider sur cette base. */
  chargement: boolean
}

/**
 * Rôle du compte connecté dans son centre (migration 0012).
 *
 * Sert à **masquer** les commandes réservées au responsable plutôt qu'à offrir
 * des boutons dont l'écriture serait refusée par la RLS. Ce n'est donc pas une
 * mesure de sécurité : c'est de la lisibilité. L'autorité reste les policies.
 *
 * `estResponsable` est **faux pendant le chargement**, à dessein : la valeur
 * ouvre des commandes, et une ouverture par défaut afficherait brièvement des
 * boutons de gestion à un enseignant. Les appelants qui veulent éviter ce
 * clignotement attendent `chargement`.
 */
export function useMembre(): MembreCourant {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const requete = useQuery({
    queryKey: membreKeys.courant(userId),
    queryFn: () => membreRepo.getCourant(userId as string),
    enabled: userId !== null,
    // L'appartenance ne bouge pas pendant qu'on travaille.
    staleTime: 60 * 60_000,
  })

  const membre = requete.data ?? null
  const role = membre && estRole(membre.role) ? membre.role : null

  return {
    membre,
    centreId: membre?.centre_id ?? null,
    role,
    estResponsable: role === 'responsable',
    chargement: userId !== null && requete.isPending,
  }
}
