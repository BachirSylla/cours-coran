/**
 * Clés de cache du suivi apprenant.
 *
 * Côté enseignant, il n'y a pas de famille propre : le jeton vit sur la ligne
 * `inscription`, donc ouvrir, régénérer ou fermer un suivi invalide
 * `inscriptionKeys`. Seule la consultation publique, qui n'a rien en cache, a
 * besoin de la sienne.
 */
export const suiviKeys = {
  tous: ['suivi-apprenant'] as const,
  parJeton: (jeton: string) => [...suiviKeys.tous, jeton] as const,
}
