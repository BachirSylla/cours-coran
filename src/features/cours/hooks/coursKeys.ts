/**
 * Clés de cache des cours et des créneaux.
 *
 * Les deux familles sont liées : enregistrer un cours réécrit ses créneaux,
 * donc modifie l'ensemble contre lequel se calcule la détection de conflit.
 * Toute mutation de cours invalide les deux.
 */
export const coursKeys = {
  tous: ['cours'] as const,
  /**
   * La SESSION fait partie de la clé (0022) : basculer d'une session à l'autre
   * ne doit pas réutiliser la liste précédente, et n'a pas besoin de
   * l'invalider. Une invalidation de `tous` couvre toutes les sessions.
   */
  liste: (sessionId: string) => [...coursKeys.tous, 'liste', sessionId] as const,
  /** Toutes sessions confondues — voir `useCoursToutesSessions`. */
  listeGlobale: () => [...coursKeys.tous, 'liste', 'toutes-sessions'] as const,
  detail: (id: string) => [...coursKeys.tous, 'detail', id] as const,
}

export const creneauKeys = {
  tous: ['creneaux'] as const,
  liste: () => [...creneauKeys.tous, 'liste'] as const,
  parCours: (coursId: string) => [...creneauKeys.tous, 'cours', coursId] as const,
}
