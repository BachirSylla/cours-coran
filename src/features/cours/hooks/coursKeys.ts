/**
 * Clés de cache des cours et des créneaux.
 *
 * Les deux familles sont liées : enregistrer un cours réécrit ses créneaux,
 * donc modifie l'ensemble contre lequel se calcule la détection de conflit.
 * Toute mutation de cours invalide les deux.
 */
export const coursKeys = {
  tous: ['cours'] as const,
  liste: () => [...coursKeys.tous, 'liste'] as const,
  detail: (id: string) => [...coursKeys.tous, 'detail', id] as const,
}

export const creneauKeys = {
  tous: ['creneaux'] as const,
  liste: () => [...creneauKeys.tous, 'liste'] as const,
  parCours: (coursId: string) => [...creneauKeys.tous, 'cours', coursId] as const,
}
