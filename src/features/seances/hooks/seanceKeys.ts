/**
 * Clés de cache des séances et des présences.
 *
 * La plage est dans la clé : naviguer d'une semaine à l'autre ne recharge que
 * ce qui manque, et enregistrer une séance invalide toute la famille (une
 * séance peut apparaître dans la semaine affichée comme dans la fiche du cours).
 */
export const seanceKeys = {
  tous: ['seances'] as const,
  plage: (debut: string, fin: string) => [...seanceKeys.tous, 'plage', debut, fin] as const,
  parCours: (coursId: string) => [...seanceKeys.tous, 'cours', coursId] as const,
  /**
   * Séances **avec leurs présences** — le rapport de session.
   *
   * Clé distincte de `parCours`, et ce n'est pas un détail : les deux requêtes
   * portent sur les mêmes lignes mais **pas sur la même forme**. Les faire
   * cohabiter sous une seule clé donnait au rapport des séances dépourvues de
   * leur tableau `presence`, selon laquelle des deux avait rempli le cache en
   * premier. Elle reste préfixée par `parCours`, donc toujours couverte par une
   * invalidation de la famille.
   */
  avecPresences: (coursId: string) => [...seanceKeys.parCours(coursId), 'presences'] as const,
}

export const presenceKeys = {
  tous: ['presences'] as const,
  parSeance: (seanceId: string) => [...presenceKeys.tous, 'seance', seanceId] as const,
  parApprenant: (apprenantId: string) =>
    [...presenceKeys.tous, 'apprenant', apprenantId] as const,
}
