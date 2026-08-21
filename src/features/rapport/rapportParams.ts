import { z } from 'zod'

/**
 * Paramètres du rapport, transportés par la **query string**.
 *
 * Pas par `location.state` : le rapport s'ouvre dans un onglet neuf — ce qui
 * perd le state — et doit rester ré-imprimable depuis un favori ou un lien
 * recollé le mois suivant.
 *
 * Chaque champ est facultatif et retombe sur une valeur sûre : une URL tronquée
 * à la main doit produire un rapport, pas un écran d'erreur. D'où les `.catch()`.
 *
 * Module pur : ni React, ni `window`.
 */

const FORMAT_DATE = /^\d{4}-\d{2}-\d{2}$/

const dateFacultative = z
  .string()
  .trim()
  .optional()
  .transform((valeur) => (valeur && FORMAT_DATE.test(valeur) ? valeur : null))
  .catch(null)

const texteFacultatif = z
  .string()
  .trim()
  .max(80)
  .optional()
  .transform((valeur) => (valeur === undefined || valeur === '' ? null : valeur))
  .catch(null)

export const rapportParamsSchema = z.object({
  /** Bornes incluses. `null` des deux côtés = tout le cours. */
  du: dateFacultative,
  au: dateFacultative,
  niveau: texteFacultatif,
  session: texteFacultatif,
  centre: texteFacultatif,
})

export type RapportParams = z.output<typeof rapportParamsSchema>

export const PARAMS_VIDES: RapportParams = {
  du: null,
  au: null,
  niveau: null,
  session: null,
  centre: null,
}

/** Lit les paramètres depuis une query string. Ne lève jamais. */
export function lireRapportParams(recherche: string | URLSearchParams): RapportParams {
  const entrees = new URLSearchParams(recherche)
  const resultat = rapportParamsSchema.safeParse(Object.fromEntries(entrees))

  return resultat.success ? resultat.data : PARAMS_VIDES
}

/**
 * Construit la query string du rapport. Les champs vides sont omis plutôt que
 * transmis vides : l'URL partagée reste lisible.
 */
export function ecrireRapportParams(params: RapportParams): string {
  const recherche = new URLSearchParams()

  for (const [cle, valeur] of Object.entries(params)) {
    if (valeur !== null && valeur !== '') recherche.set(cle, valeur)
  }

  return recherche.toString()
}

/** `/cours/<id>/rapport?...` — chemin partagé avec `app/router.tsx`. */
export function urlRapport(coursId: string, params: RapportParams): string {
  const recherche = ecrireRapportParams(params)

  return `/cours/${coursId}/rapport${recherche ? `?${recherche}` : ''}`
}
