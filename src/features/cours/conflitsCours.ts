import {
  detecterTousLesConflits,
  heureEnMinutes,
  trouverConflits,
  type CreneauAffecte,
  type CreneauHoraire,
  type JourSemaine,
} from '@/shared/lib/conflits'
import { libelleJour } from '@/features/cours/coursSchema'

/**
 * Intégration de la règle de conflit (CLAUDE.md §5.1) au formulaire de cours.
 *
 * Ce module **n'implémente aucune règle** : il orchestre les fonctions pures et
 * testées de `shared/lib/conflits.ts`, et se contente de rattacher chaque
 * chevauchement à la ligne du formulaire et au cours fautif.
 */

/** Créneau déjà enregistré, enrichi du libellé de son cours. */
export interface CreneauExistant extends CreneauAffecte {
  id: string
  cours_id: string
  cours_libelle: string
}

/** Ligne du formulaire, telle que saisie (valeurs encore potentiellement partielles). */
export interface CreneauSaisi {
  jour_semaine: number | string
  heure_debut: string
  heure_fin: string
}

export type ConflitCreneau =
  | { type: 'interne'; index: number; autreIndex: number; creneau: CreneauHoraire }
  | { type: 'externe'; index: number; creneau: CreneauHoraire; coursLibelle: string }

const FORMAT_HEURE = /^([01]?\d|2[0-4]):[0-5]\d(:[0-5]\d)?$/

/** Ligne exploitable = jour valide et deux heures bien formées, fin après début. */
function normaliser(
  saisi: CreneauSaisi,
  enseignantId: string | null,
  sessionId: string
): CreneauAffecte | null {
  const jour = Number(saisi.jour_semaine)

  if (!Number.isInteger(jour) || jour < 1 || jour > 7) return null
  if (!FORMAT_HEURE.test(saisi.heure_debut) || !FORMAT_HEURE.test(saisi.heure_fin)) return null

  const creneau: CreneauAffecte = {
    jour_semaine: jour as JourSemaine,
    heure_debut: saisi.heure_debut,
    heure_fin: saisi.heure_fin,
    enseignant_id: enseignantId,
    session_id: sessionId,
  }

  // Un créneau incohérent est signalé par le schéma Zod, pas ici.
  // Comparaison en minutes : « 9:00 » et « 10:00 » ne se comparent pas comme des chaînes.
  return heureEnMinutes(creneau.heure_fin) > heureEnMinutes(creneau.heure_debut)
    ? creneau
    : null
}

/** Ce contre quoi le formulaire est confronté. */
export interface ContexteConflit {
  /**
   * Session du cours en cours de saisie. **Obligatoire**, et regroupée ici avec
   * les deux autres plutôt qu'ajoutée en quatrième paramètre optionnel : un
   * paramètre facultatif se serait fait oublier par un appelant, et le scope
   * aurait cessé de s'appliquer sans que rien ne le signale.
   */
  sessionId: string
  /**
   * En modification, l'identifiant du cours édité : ses propres créneaux
   * enregistrés sont ignorés, sinon il se détecterait lui-même.
   */
  coursIdEdite?: string
  /**
   * Enseignant qui **assurera** ce cours — celui déjà affecté en modification,
   * le créateur en création (`enregistrer_cours` l'y pose). `null` range le
   * cours dans le groupe des non affectés.
   */
  enseignantId?: string | null
}

/**
 * Détecte les conflits d'un formulaire de cours :
 * (a) entre les créneaux saisis eux-mêmes ;
 * (b) contre les créneaux du **même enseignant et de la même session**, tous
 *     cours confondus.
 *
 * Ceci n'est qu'un **aperçu**. La source de vérité reste `enregistrer_cours`,
 * qui refuse le chevauchement de façon atomique au moment d'écrire.
 */
export function detecterConflitsFormulaire(
  creneauxSaisis: readonly CreneauSaisi[],
  creneauxExistants: readonly CreneauExistant[],
  contexte: ContexteConflit
): ConflitCreneau[] {
  const { sessionId, coursIdEdite, enseignantId = null } = contexte
  const conflits: ConflitCreneau[] = []

  // Les lignes incomplètes (en cours de frappe) sont ignorées, sans décaler les index.
  const lignes = creneauxSaisis.map((saisi, index) => ({
    index,
    creneau: normaliser(saisi, enseignantId, sessionId),
  }))
  const exploitables = lignes.filter(
    (ligne): ligne is { index: number; creneau: CreneauAffecte } => ligne.creneau !== null
  )

  // (a) Chevauchements internes au cours en cours de saisie. Toutes ces lignes
  //     partagent le même enseignant : le regroupement les laisse ensemble.
  for (const [a, b] of detecterTousLesConflits(exploitables.map((l) => l.creneau))) {
    const premier = exploitables.find((l) => l.creneau === a)
    const second = exploitables.find((l) => l.creneau === b)
    if (premier && second) {
      conflits.push({
        type: 'interne',
        index: second.index,
        autreIndex: premier.index,
        creneau: second.creneau,
      })
    }
  }

  // (b) Chevauchements avec les créneaux des autres cours.
  for (const { index, creneau } of exploitables) {
    const trouves = trouverConflits(creneau, creneauxExistants, {
      ignorer: (existant) => existant.cours_id === coursIdEdite,
    })

    for (const trouve of trouves) {
      conflits.push({ type: 'externe', index, creneau, coursLibelle: trouve.cours_libelle })
    }
  }

  return conflits
}

/** « Lundi 11:00–12:00 chevauche le cours « Groupe Hifz » du même enseignant. » */
export function messageConflit(conflit: ConflitCreneau): string {
  const { creneau } = conflit
  const plage = `${libelleJour(creneau.jour_semaine)} ${creneau.heure_debut.slice(0, 5)}–${creneau.heure_fin.slice(0, 5)}`

  return conflit.type === 'interne'
    ? `${plage} chevauche un autre créneau de ce cours.`
    : `${plage} chevauche le cours « ${conflit.coursLibelle} » du même enseignant.`
}

/** Index des lignes du formulaire à surligner. */
export function indexEnConflit(conflits: readonly ConflitCreneau[]): Set<number> {
  const index = new Set<number>()

  for (const conflit of conflits) {
    index.add(conflit.index)
    if (conflit.type === 'interne') index.add(conflit.autreIndex)
  }

  return index
}
