import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * La session sur laquelle l'application est ouverte.
 *
 * Premier usage de Zustand dans le projet (CLAUDE.md §2 le prévoit pour l'état
 * local léger). C'est bien un état **local** : il ne vit pas côté serveur, ne se
 * synchronise avec rien, et n'a pas sa place dans TanStack Query — qui gère le
 * cache des données du serveur, pas les préférences d'affichage.
 *
 * Persisté par appareil : on retrouve la session où l'on travaillait en
 * rouvrant l'application. Pas dans l'URL, délibérément — cela obligerait chaque
 * route et chaque navigation à la transporter, pour un bénéfice (partager un
 * lien qui ouvre la bonne session) que personne n'a demandé.
 *
 * ⚠️ `id` n'est qu'une **préférence**, jamais une autorisation. Un identifiant
 * périmé — session supprimée en base, ou appartenant à un centre qu'on a quitté —
 * ne donne accès à rien : la RLS ne renvoie que les sessions du centre courant,
 * et `useSessionActive` retombe alors sur la session la plus récente.
 */
interface EtatSessionActive {
  /** `null` = aucune préférence : on prendra la session la plus récente. */
  id: string | null
  choisir: (id: string | null) => void
}

export const useSessionActiveStore = create<EtatSessionActive>()(
  persist(
    (set) => ({
      id: null,
      choisir: (id) => set({ id }),
    }),
    { name: 'cours-coran.session-active' }
  )
)
