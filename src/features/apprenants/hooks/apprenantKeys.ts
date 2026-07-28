/**
 * Clés de cache TanStack Query pour les apprenants, centralisées :
 * une invalidation sur `apprenantKeys.tous` couvre la liste et les fiches.
 */
export const apprenantKeys = {
  tous: ['apprenants'] as const,
  liste: () => [...apprenantKeys.tous, 'liste'] as const,
  detail: (id: string) => [...apprenantKeys.tous, 'detail', id] as const,
}
