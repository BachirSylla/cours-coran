import type { NoteAvecBareme } from '@/shared/lib/evaluations'
import {
  compterPresence,
  etatEffectif,
  libelleContenuSeance,
  moyenneRevisions,
  noteAcademique,
  noteAssiduite,
  noteFinale,
  type ComptagePresence,
  type ConfigNotation,
  type EtatPresence,
} from '@/shared/lib/rapport'

/**
 * Assemblage du rapport de fin de session — module **pur** (ni Supabase, ni
 * React, ni DOM).
 *
 * Il ne calcule rien lui-même : toute la logique de notation vit dans
 * `rapport.ts` et il s'en sert. Son rôle est de **croiser** séances, présences,
 * notes et inscriptions en un modèle que la feuille imprimée n'a plus qu'à
 * afficher, sans une seule décision métier.
 *
 * Il définit ses propres types d'entrée plutôt que d'importer ceux de Supabase :
 * il reste ainsi testable avec des objets écrits à la main.
 */

/**
 * Seules les séances réellement tenues comptent. `seance.statut` vaut aussi
 * `annulee` et `reportee` — pénaliser un apprenant pour une séance que
 * l'enseignant a lui-même annulée serait un contresens (voir la précondition de
 * `compterPresence`).
 */
const STATUT_TENUE = 'faite'

/** Au-delà, les pastilles deviennent illisibles sur une A4 paysage. */
export const SEANCES_PAR_BLOC = 20

export interface PresenceRapport {
  apprenant_id: string
  etat: string | null
  present: boolean
  note: number | null
  note_bareme: number | null
}

export interface SeanceRapport {
  id: string
  /** Format `AAAA-MM-JJ`. */
  date: string
  statut: string
  sourate: string | null
  versets_de: number | null
  versets_a: number | null
  contenu_aborde: string | null
  presence: readonly PresenceRapport[]
}

export interface InscritRapport {
  apprenant_id: string
  prenom: string | null
  nom: string | null
  note_examen: number | null
  examen_bareme: number | null
}

/** Bornes de la période demandée. `null` de part et d'autre = tout le cours. */
export interface PeriodeRapport {
  debut: string | null
  fin: string | null
}

export interface ColonneSeance {
  seance_id: string
  date: string
  /** Contenu travaillé — « Aṭ-Ṭûr v1–14 », « Tadjwîd : … », ou la date. */
  libelle: string
}

export interface LigneRapport {
  apprenant_id: string
  prenom: string
  nom: string
  /** État par `seance_id`. Toute séance retenue y figure. */
  etats: Record<string, EtatPresence>
  /** Note par `seance_id`. Une séance non notée n'y figure pas. */
  notes: Record<string, NoteAvecBareme>
  comptage: ComptagePresence
  /** Part de séances où l'apprenant était là, en pourcentage. */
  pourcentagePresence: number
  assiduite: number
  nbNotes: number
  moyenneRevisions: number | null
  examen: NoteAvecBareme | null
  academique: number | null
  finale: number | null
}

export interface SyntheseRapport {
  moyenneFinale: number | null
  presenceMoyenne: number | null
  meilleureNote: number | null
  nbSeances: number
  nbApprenants: number
}

export interface RapportSession {
  colonnesPresence: ColonneSeance[]
  /** Restreintes aux séances portant au moins une note. */
  colonnesNotes: ColonneSeance[]
  lignes: LigneRapport[]
  synthese: SyntheseRapport
  /** Bornes réellement observées, ou `null` si aucune séance n'est retenue. */
  periode: { debut: string; fin: string } | null
  config: ConfigNotation
  /**
   * Barème partagé par tous les examens notés, ou `null` s'ils diffèrent — ou
   * qu'aucun n'a été saisi. L'en-tête de colonne ne peut afficher « /20 » que
   * dans le premier cas ; sinon chaque note porte le sien.
   */
  baremeExamenCommun: number | null
}

export interface EntreesRapport {
  seances: readonly SeanceRapport[]
  inscrits: readonly InscritRapport[]
  config: ConfigNotation
  periode: PeriodeRapport
}

/**
 * Niveau d'une note finale, pour la mettre en valeur sur la feuille.
 * Les seuils sont ceux de la maquette : 16,35 en vert, 14,99 en ambre.
 */
export type NiveauNote = 'bon' | 'moyen' | 'faible'

export function niveauNoteFinale(note: number | null): NiveauNote | null {
  if (note === null) return null
  if (note >= 16) return 'bon'
  if (note >= 10) return 'moyen'

  return 'faible'
}

/** Deux décimales, comme les notes de `rapport.ts`. */
function arrondir(valeur: number): number {
  return Math.round(valeur * 100) / 100
}

/** Comparaison lexicographique : valide pour des dates `AAAA-MM-JJ`. */
function dansLaPeriode(date: string, periode: PeriodeRapport): boolean {
  if (periode.debut !== null && date < periode.debut) return false
  if (periode.fin !== null && date > periode.fin) return false

  return true
}

function estNotee(presence: PresenceRapport): presence is PresenceRapport & NoteAvecBareme {
  return presence.note !== null && presence.note_bareme !== null
}

/**
 * Découpe une liste en blocs imprimables.
 *
 * Une A4 paysage n'offre pas assez de largeur au-delà d'une vingtaine de
 * colonnes : plutôt que de rétrécir indéfiniment, on répète la grille — chaque
 * bloc reste à l'échelle où il se lit.
 */
export function decouperEnBlocs<T>(elements: readonly T[], taille = SEANCES_PAR_BLOC): T[][] {
  if (!Number.isInteger(taille) || taille < 1) {
    throw new Error(`Taille de bloc invalide : ${taille}`)
  }

  const blocs: T[][] = []

  for (let debut = 0; debut < elements.length; debut += taille) {
    blocs.push(elements.slice(debut, debut + taille))
  }

  return blocs
}

export function construireRapport({
  seances,
  inscrits,
  config,
  periode,
}: EntreesRapport): RapportSession {
  const retenues = seances
    .filter((seance) => seance.statut === STATUT_TENUE && dansLaPeriode(seance.date, periode))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

  function enColonne(seance: SeanceRapport): ColonneSeance {
    return { seance_id: seance.id, date: seance.date, libelle: libelleContenuSeance(seance) }
  }

  const colonnesPresence = retenues.map(enColonne)

  // Une colonne de notes n'a de sens que si quelqu'un a été noté ce jour-là :
  // sinon la grille serait à moitié faite de tirets.
  const colonnesNotes = retenues
    .filter((seance) => seance.presence.some(estNotee))
    .map(enColonne)

  const lignes = inscrits
    .map((inscrit) => construireLigne(inscrit, retenues, config))
    .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'))

  return {
    colonnesPresence,
    colonnesNotes,
    lignes,
    synthese: resumer(lignes, colonnesPresence.length),
    periode: bornes(colonnesPresence),
    config,
    baremeExamenCommun: baremeCommun(lignes),
  }
}

function construireLigne(
  inscrit: InscritRapport,
  seances: readonly SeanceRapport[],
  config: ConfigNotation
): LigneRapport {
  const etats: Record<string, EtatPresence> = {}
  const notes: Record<string, NoteAvecBareme> = {}

  for (const seance of seances) {
    const ligne = seance.presence.find(
      (presence) => presence.apprenant_id === inscrit.apprenant_id
    )

    // Absent de la table = présent par défaut, comme la colonne en base.
    etats[seance.id] = ligne
      ? etatEffectif({ etat: ligne.etat, present: ligne.present })
      : 'present'

    if (ligne && estNotee(ligne)) {
      notes[seance.id] = { note: ligne.note, note_bareme: ligne.note_bareme }
    }
  }

  // L'état effectif est déjà résolu ci-dessus, donc `present` n'est plus
  // consulté par `compterPresence` — la classification revient entièrement à
  // `estPresent`, et à elle seule.
  const comptage = compterPresence(
    seances.map((seance) => ({ etat: etats[seance.id] ?? 'present', present: true }))
  )

  const listeNotes = Object.values(notes)

  const examen =
    inscrit.note_examen !== null && inscrit.examen_bareme !== null
      ? { note: inscrit.note_examen, note_bareme: inscrit.examen_bareme }
      : null

  // La moyenne qui nourrit la part académique est exactement celle qu'imprime la
  // colonne « Moy. rév. » : les chiffres du rapport s'additionnent donc à la
  // main, ce qui ne serait pas le cas avec un arrondi seulement final.
  const moyenneDevoirs = moyenneRevisions(listeNotes)

  return {
    apprenant_id: inscrit.apprenant_id,
    prenom: inscrit.prenom ?? '',
    nom: inscrit.nom ?? '',
    etats,
    notes,
    comptage,
    pourcentagePresence:
      comptage.total === 0 ? 0 : arrondir((comptage.presences / comptage.total) * 100),
    assiduite: noteAssiduite(comptage, config),
    nbNotes: listeNotes.length,
    moyenneRevisions: moyenneDevoirs,
    examen,
    academique: noteAcademique(
      examen?.note ?? null,
      examen?.note_bareme ?? null,
      config,
      moyenneDevoirs
    ),
    finale: noteFinale(
      examen?.note ?? null,
      examen?.note_bareme ?? null,
      comptage,
      config,
      moyenneDevoirs
    ),
  }
}

function resumer(lignes: readonly LigneRapport[], nbSeances: number): SyntheseRapport {
  // Une note finale absente n'est pas un zéro : un seul apprenant non examiné
  // effondrerait la moyenne de la classe.
  const finales = lignes
    .map((ligne) => ligne.finale)
    .filter((note): note is number => note !== null)

  const presences = lignes.map((ligne) => ligne.pourcentagePresence)

  return {
    moyenneFinale:
      finales.length === 0
        ? null
        : arrondir(finales.reduce((somme, note) => somme + note, 0) / finales.length),
    presenceMoyenne:
      presences.length === 0
        ? null
        : arrondir(presences.reduce((somme, taux) => somme + taux, 0) / presences.length),
    meilleureNote: finales.length === 0 ? null : Math.max(...finales),
    nbSeances,
    nbApprenants: lignes.length,
  }
}

function bornes(colonnes: readonly ColonneSeance[]): { debut: string; fin: string } | null {
  const premiere = colonnes[0]
  const derniere = colonnes[colonnes.length - 1]

  return premiere && derniere ? { debut: premiere.date, fin: derniere.date } : null
}

function baremeCommun(lignes: readonly LigneRapport[]): number | null {
  const baremes = new Set(
    lignes
      .map((ligne) => ligne.examen?.note_bareme)
      .filter((bareme): bareme is number => bareme !== undefined)
  )

  return baremes.size === 1 ? ([...baremes][0] ?? null) : null
}
