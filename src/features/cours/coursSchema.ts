import { z } from 'zod'

import { heureEnMinutes, type JourSemaine } from '@/shared/lib/conflits'

/**
 * Validation de la **structure** d'un cours et de ses créneaux — schéma unique
 * partagé par le formulaire (React Hook Form) et la logique (CLAUDE.md §9).
 *
 * Le lien de visioconférence n'y figure plus : il relève de l'enseignant qui
 * assure le cours, et se règle dans sa fiche (migration 0017).
 *
 * Comme pour les apprenants, deux types en sortent : `z.input` (ce que manipule
 * le formulaire, tout en chaînes) et `z.output` (ce qui part vers le repository,
 * avec des `null` et des nombres).
 */
export const FORMATS_COURS = ['individuel', 'groupe'] as const
export const STATUTS_COURS = ['actif', 'pause', 'termine'] as const

export type FormatCours = (typeof FORMATS_COURS)[number]
export type StatutCours = (typeof STATUTS_COURS)[number]

export const LIBELLES_FORMAT: Record<FormatCours, string> = {
  individuel: 'Individuel',
  groupe: 'Groupe',
}

export const LIBELLES_STATUT_COURS: Record<StatutCours, string> = {
  actif: 'Actif',
  pause: 'En pause',
  termine: 'Terminé',
}

/** Jours ISO-8601 : 1 = lundi … 7 = dimanche (aligné sur `getISODay` de date-fns). */
export const JOURS_SEMAINE: { valeur: JourSemaine; libelle: string; abrege: string }[] = [
  { valeur: 1, libelle: 'Lundi', abrege: 'Lun' },
  { valeur: 2, libelle: 'Mardi', abrege: 'Mar' },
  { valeur: 3, libelle: 'Mercredi', abrege: 'Mer' },
  { valeur: 4, libelle: 'Jeudi', abrege: 'Jeu' },
  { valeur: 5, libelle: 'Vendredi', abrege: 'Ven' },
  { valeur: 6, libelle: 'Samedi', abrege: 'Sam' },
  { valeur: 7, libelle: 'Dimanche', abrege: 'Dim' },
]

export function libelleJour(jour: number): string {
  return JOURS_SEMAINE.find((j) => j.valeur === jour)?.libelle ?? `Jour ${jour}`
}

export function abregeJour(jour: number): string {
  return JOURS_SEMAINE.find((j) => j.valeur === jour)?.abrege ?? `J${jour}`
}

const FORMAT_DATE = /^\d{4}-\d{2}-\d{2}$/
const FORMAT_HEURE = /^([01]?\d|2[0-4]):[0-5]\d(:[0-5]\d)?$/

/** Date du jour au format `AAAA-MM-JJ`, dans le fuseau local. */
export function aujourdhui(): string {
  const maintenant = new Date()
  const mois = String(maintenant.getMonth() + 1).padStart(2, '0')
  const jour = String(maintenant.getDate()).padStart(2, '0')
  return `${maintenant.getFullYear()}-${mois}-${jour}`
}

export const creneauSchema = z
  .object({
    jour_semaine: z
      .union([z.string(), z.number()])
      .transform((valeur) => Number(valeur))
      .pipe(
        z
          .number({ message: 'Jour invalide.' })
          .int({ message: 'Jour invalide.' })
          .min(1, { message: 'Jour invalide.' })
          .max(7, { message: 'Jour invalide.' })
      ),
    heure_debut: z
      .string()
      .trim()
      .min(1, { message: "L'heure de début est obligatoire." })
      .regex(FORMAT_HEURE, { message: 'Heure invalide (format HH:MM).' }),
    heure_fin: z
      .string()
      .trim()
      .min(1, { message: "L'heure de fin est obligatoire." })
      .regex(FORMAT_HEURE, { message: 'Heure invalide (format HH:MM).' }),
  })
  .superRefine((creneau, ctx) => {
    // Zod exécute ce refinement même si un champ a déjà échoué : sans ce garde,
    // `heureEnMinutes` lèverait sur une saisie encore partielle (« 10h »).
    if (!FORMAT_HEURE.test(creneau.heure_debut) || !FORMAT_HEURE.test(creneau.heure_fin)) {
      return
    }

    // Aucune marge automatique entre les cours (CLAUDE.md §5.1, §10) :
    // on exige seulement que le créneau dure au moins une minute.
    if (heureEnMinutes(creneau.heure_fin) <= heureEnMinutes(creneau.heure_debut)) {
      ctx.addIssue({
        code: 'custom',
        path: ['heure_fin'],
        message: "L'heure de fin doit être après l'heure de début.",
      })
    }
  })

export const coursSchema = z
  .object({
    libelle: z
      .string()
      .trim()
      .min(1, { message: 'Le libellé est obligatoire.' })
      .max(120, { message: 'Le libellé ne peut pas dépasser 120 caractères.' }),
    type_cours_id: z
      .string()
      .trim()
      .min(1, { message: 'Le type de cours est obligatoire.' })
      .pipe(z.uuid({ message: 'Type de cours invalide.' })),
    format: z.enum(FORMATS_COURS, { message: 'Format invalide.' }),
    /**
     * Session à laquelle appartient le cours (migration 0022).
     *
     * Obligatoire, et validée ici plutôt que laissée à la base : sans elle,
     * `enregistrer_cours` lève P0060 et l'utilisateur reçoit un message
     * technique après avoir rempli tout le formulaire. Le champ n'est pas
     * saisi — il vient de la session active, ou de celle du cours édité.
     */
    session_id: z
      .string()
      .trim()
      .min(1, { message: 'Le cours doit appartenir à une session.' })
      .pipe(z.uuid({ message: 'Session invalide.' })),
    /**
     * Niveau, texte libre proposé parmi ceux déjà employés dans le centre.
     * Vide → `null` : une chaîne vide et « pas de niveau » sont la même chose,
     * et deux représentations d'un même état finissent toujours par diverger.
     */
    niveau: z
      .string()
      .trim()
      .max(60, { message: 'Le niveau ne peut pas dépasser 60 caractères.' })
      .optional()
      .transform((valeur) => (valeur === undefined || valeur === '' ? null : valeur)),
    /**
     * Enseignant affecté (migration 0014). Vide = non fourni : la base garde
     * alors l'affectation en place, et pose le créateur à la création. Ce
     * n'est **pas** une désaffectation.
     */
    enseignant_id: z
      .string()
      .trim()
      .optional()
      .transform((valeur) => (valeur === undefined || valeur === '' ? null : valeur))
      .refine((valeur) => valeur === null || z.uuid().safeParse(valeur).success, {
        message: 'Enseignant invalide.',
      }),
    date_debut: z
      .string()
      .trim()
      .min(1, { message: 'La date de début est obligatoire.' })
      .regex(FORMAT_DATE, { message: 'La date de début est invalide.' }),
    date_fin: z
      .string()
      .trim()
      .optional()
      .transform((valeur) => (valeur === undefined || valeur === '' ? null : valeur))
      .refine((valeur) => valeur === null || FORMAT_DATE.test(valeur), {
        message: 'La date de fin est invalide.',
      }),
    prix_mensuel: z
      .union([z.string(), z.number()])
      .optional()
      .transform((valeur) => {
        if (valeur === undefined || valeur === '') return null
        // Le séparateur décimal français est accepté.
        return typeof valeur === 'number' ? valeur : Number(valeur.trim().replace(',', '.'))
      })
      .refine((valeur) => valeur === null || (Number.isFinite(valeur) && valeur >= 0), {
        message: 'Le prix mensuel doit être un nombre positif.',
      }),
    /*
     * Le forfait couvrant TOUTE la session (migration 0026). Il cohabite avec le
     * prix mensuel : les deux se conservent l'un l'autre, pour qu'un centre qui
     * essaie un mode puis revient retrouve son tarif intact.
     */
    prix_session: z
      .union([z.string(), z.number()])
      .optional()
      .transform((valeur) => {
        if (valeur === undefined || valeur === '') return null
        return typeof valeur === 'number' ? valeur : Number(valeur.trim().replace(',', '.'))
      })
      .refine((valeur) => valeur === null || (Number.isFinite(valeur) && valeur >= 0), {
        message: 'Le forfait doit être un nombre positif.',
      }),
    devise: z
      .string()
      .trim()
      .length(3, { message: 'La devise doit comporter 3 lettres (ex. XOF).' })
      .default('XOF'),
    statut: z.enum(STATUTS_COURS, { message: 'Statut invalide.' }).default('actif'),
    creneaux: z
      .array(creneauSchema)
      .min(1, { message: 'Ajoutez au moins un créneau hebdomadaire.' }),
  })
  .superRefine((cours, ctx) => {
    // Plage de vie du cours (CLAUDE.md §5.2) : date_fin vide = cours en cours.
    if (cours.date_fin && cours.date_fin < cours.date_debut) {
      ctx.addIssue({
        code: 'custom',
        path: ['date_fin'],
        message: 'La date de fin doit être après la date de début.',
      })
    }
  })

export type CoursFormValues = z.input<typeof coursSchema>
export type CoursValues = z.output<typeof coursSchema>
export type CreneauFormValues = z.input<typeof creneauSchema>

export function creneauParDefaut(): CreneauFormValues {
  return { jour_semaine: '1', heure_debut: '10:00', heure_fin: '11:00' }
}

/**
 * `sessionId` n'a pas de défaut : le formulaire le reçoit de la session active,
 * et l'inventer ici — chaîne vide, ou « la première » — ferait atterrir un cours
 * dans une session au hasard sans que rien ne le signale.
 */
export function valeursParDefaut(sessionId: string): CoursFormValues {
  return {
    libelle: '',
    type_cours_id: '',
    session_id: sessionId,
    niveau: '',
    format: 'individuel',
    enseignant_id: '',
    date_debut: aujourdhui(),
    date_fin: '',
    prix_mensuel: '',
    prix_session: '',
    devise: 'XOF',
    statut: 'actif',
    creneaux: [creneauParDefaut()],
  }
}
