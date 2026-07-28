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
}

export const presenceKeys = {
  tous: ['presences'] as const,
  parSeance: (seanceId: string) => [...presenceKeys.tous, 'seance', seanceId] as const,
  parApprenant: (apprenantId: string) =>
    [...presenceKeys.tous, 'apprenant', apprenantId] as const,
}
