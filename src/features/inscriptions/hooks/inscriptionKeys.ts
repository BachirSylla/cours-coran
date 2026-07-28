/**
 * Clés de cache des inscriptions.
 *
 * Une inscription est vue des deux côtés : depuis le cours (« qui est
 * inscrit ? ») et depuis l'apprenant (« à quoi est-il inscrit ? »). Toute
 * mutation doit donc invalider les deux familles, plus la liste des cours qui
 * affiche un compteur d'inscrits.
 */
export const inscriptionKeys = {
  tous: ['inscriptions'] as const,
  parCours: (coursId: string) => [...inscriptionKeys.tous, 'cours', coursId] as const,
  parApprenant: (apprenantId: string) =>
    [...inscriptionKeys.tous, 'apprenant', apprenantId] as const,
}
