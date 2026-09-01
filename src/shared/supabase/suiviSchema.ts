import { z } from 'zod'

/**
 * Forme du suivi d'un apprenant tel qu'il est **publié** — la deuxième barrière.
 *
 * La première est SQL : `public.suivi_apprenant()` (migration 0019) n'a que
 * onze colonnes de sortie, et son corps est figé. Ce schéma rejoue la liste
 * blanche côté client, en mode « strip » (le défaut de Zod) : toute clé
 * inattendue est **supprimée** avant d'atteindre React. Si quelqu'un élargit un
 * jour la fonction SQL, la donnée n'arrive pas dans l'interface.
 *
 * Le raisonnement est celui de `coursPublicSchema`, en plus exigeant : cette
 * page-ci publie des notes individuelles, souvent d'enfants. Le mode strict
 * (échec sur clé inconnue) reste écarté pour la même raison — il transformerait
 * un ajout anodin en panne de la page, alors que la propriété qui compte, rien
 * de sensible ne remonte, est déjà garantie par le strip.
 *
 * Ce schéma corrige aussi les types générés : `returns table (...)` ne
 * transporte pas la nullabilité, si bien que `types.ts` annonce `logo`,
 * `enseignant`, `exercices` et `examen` non-nullables. C'est faux.
 *
 * Module pur : ni Supabase, ni React.
 */

/** `undefined` comme `null` valent « non renseigné ». */
const texteFacultatif = z
  .string()
  .nullish()
  .transform((valeur) => valeur ?? null)

/**
 * État de présence d'une séance notée. Laissé en `string` : l'interprétation
 * (« en retard », « présent ») vit dans la page, pas dans le contrat de
 * transport. Une valeur inconnue s'affiche alors sans état plutôt que de faire
 * échouer la page entière.
 */
export const evaluationSuiviSchema = z.object({
  /** Format `AAAA-MM-JJ`. */
  date: z.string(),
  /** Sourate + versets, à défaut le contenu libre. `null` si ni l'un ni l'autre. */
  contenu: texteFacultatif,
  note: z.number(),
  bareme: z.number(),
  /** Mot de l'enseignant à l'élève. Vide et absent sont ramenés à `null` par SQL. */
  commentaire: texteFacultatif,
  etat: z.string(),
})

/**
 * Comptage sur les seules séances **réellement tenues** — une séance annulée
 * n'est l'absence de personne.
 */
export const assiduiteSuiviSchema = z.object({
  present: z.number(),
  retard: z.number(),
  absent: z.number(),
  excuse: z.number(),
  partiel: z.number(),
  seances: z.number(),
})

/** La note ne va jamais sans son barème : les deux, ou rien. */
export const examenSuiviSchema = z.object({
  note: z.number(),
  bareme: z.number(),
})

export const suiviApprenantSchema = z.object({
  apprenant: z.string(),
  cours_libelle: z.string(),
  type_libelle: z.string(),
  /** `null` quand le cours n'est affecté à personne. */
  enseignant: texteFacultatif,
  centre_nom: z.string(),
  /** Image en `data:` — celle du cours, à défaut celle du centre. */
  logo: texteFacultatif,
  /** `actif` | `pause` | `termine`, non interprété ici. */
  statut: z.string(),
  /** Uniquement les séances réellement notées — jamais de ligne vide. */
  evaluations: z.array(evaluationSuiviSchema),
  assiduite: assiduiteSuiviSchema,
  /** `null` tant que l'examen n'a pas eu lieu. */
  examen: examenSuiviSchema.nullish().transform((valeur) => valeur ?? null),
  /** Exercices de la dernière séance tenue qui en portait. */
  exercices: texteFacultatif,
})

export type SuiviApprenant = z.output<typeof suiviApprenantSchema>
export type EvaluationSuivi = z.output<typeof evaluationSuiviSchema>
export type AssiduiteSuivi = z.output<typeof assiduiteSuiviSchema>
export type ExamenSuivi = z.output<typeof examenSuiviSchema>
