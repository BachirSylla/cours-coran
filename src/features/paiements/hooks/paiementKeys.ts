/**
 * Clés de cache des paiements. Le mois fait partie de la clé : naviguer d'un
 * mois à l'autre ne recharge que ce qui manque.
 */
export const paiementKeys = {
  tous: ['paiements'] as const,
  mois: (mois: string) => [...paiementKeys.tous, 'mois', mois] as const,
  parCours: (coursId: string) => [...paiementKeys.tous, 'cours', coursId] as const,
}
