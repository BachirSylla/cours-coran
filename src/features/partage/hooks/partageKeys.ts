/**
 * Clés de cache du partage.
 *
 * Côté enseignant, il n'y a pas de famille propre : le jeton vit sur la ligne
 * `cours`, donc activer, régénérer ou désactiver invalide `coursKeys`. Seule la
 * consultation publique, qui n'a pas de cours en cache, a besoin de la sienne.
 */
export const coursPublicKeys = {
  tous: ['cours-public'] as const,
  parJeton: (jeton: string) => [...coursPublicKeys.tous, jeton] as const,
}
