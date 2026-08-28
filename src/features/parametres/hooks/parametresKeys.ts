/**
 * Clés de cache des réglages.
 *
 * Une seule ligne `parametres` par centre, mais la valeur servie dépend aussi du
 * compte : le barème de récitation est propre à chaque enseignant (migration
 * 0012). D'où une clé dérivée — `tous` reste le préfixe à invalider.
 */
export const parametresKeys = {
  tous: ['parametres'] as const,
  duCompte: (userId: string | null) => [...parametresKeys.tous, userId] as const,
}
