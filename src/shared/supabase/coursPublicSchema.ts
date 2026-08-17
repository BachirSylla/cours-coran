import { z } from 'zod'

/**
 * Forme du cours tel qu'il est **publié** — la deuxième barrière.
 *
 * La première est SQL : `public.cours_public()` (migration 0007) n'a que huit
 * colonnes de sortie, et son corps est figé. Ce schéma rejoue la liste blanche
 * côté client, en mode « strip » (le défaut de Zod) : toute clé inattendue est
 * **supprimée** avant d'atteindre React. Si quelqu'un élargit un jour la
 * fonction SQL, la donnée n'arrive pas dans l'interface.
 *
 * Le mode strict (échec sur clé inconnue) a été écarté : il transformerait un
 * ajout anodin en panne de la page publique, alors que la propriété qui compte
 * — rien de sensible ne remonte — est déjà garantie par le strip.
 *
 * Ce schéma corrige aussi les types générés : `returns table (...)` ne
 * transporte pas la nullabilité, si bien que `types.ts` annonce `lien_meet`,
 * `date_fin` et `dernier_exercice` non-nullables. C'est faux.
 *
 * Module pur : ni Supabase, ni React.
 */

/** Jours ISO-8601 : 1 = lundi … 7 = dimanche (aligné sur `getISODay`). */
const JOURS_ISO = [1, 2, 3, 4, 5, 6, 7] as const

/** `undefined` comme `null` valent « non renseigné ». */
const texteFacultatif = z
  .string()
  .nullish()
  .transform((valeur) => valeur ?? null)

export const creneauPublicSchema = z.object({
  jour_semaine: z.literal(JOURS_ISO),
  /** Heure `time` de Postgres, brute : « 09:00:00 ». */
  heure_debut: z.string(),
  heure_fin: z.string(),
})

export const coursPublicSchema = z.object({
  libelle: z.string(),
  type_libelle: z.string(),
  /** `null` quand l'enseignant n'en a pas mis, ou quand le cours n'est plus actif. */
  lien_meet: texteFacultatif,
  date_debut: z.string(),
  date_fin: texteFacultatif,
  /**
   * Laissé en `string` : l'interprétation (« en pause », « terminé ») vit dans
   * `features/partage/etatCoursPublic.ts`. Le contrat de transport ne décide pas
   * de ce que l'écran raconte.
   */
  statut: z.string(),
  creneaux: z.array(creneauPublicSchema),
  dernier_exercice: texteFacultatif,
})

export type CoursPublic = z.output<typeof coursPublicSchema>
export type CreneauPublic = z.output<typeof creneauPublicSchema>
