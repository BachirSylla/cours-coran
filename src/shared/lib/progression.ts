/**
 * Suivi pédagogique cumulé d'un apprenant (CLAUDE.md §6).
 *
 * Agrégation **en lecture** des séances déjà saisies : aucune table dédiée,
 * aucune donnée à ressaisir. Module **pur** — ni Supabase, ni React, ni DOM.
 *
 * Point de conception important : `sourate` est un texte libre, il n'existe
 * donc **aucun ordre fiable** entre deux sourates (« Al-Baqara » avant ou après
 * « An-Nas » ? l'alphabet ne le dit pas). On ne calcule jamais un « plus loin
 * atteint » : on s'en tient à ce qui est vrai, la chronologie.
 */

/** Statut d'une séance réellement effectuée. */
const STATUT_FAITE = 'faite'

/** Sous-ensemble d'une séance nécessaire au calcul. */
export interface SeanceProgression {
  date: string
  statut: string
  contenu_aborde: string | null
  sourate: string | null
  versets_de: number | null
  versets_a: number | null
  type_travail: string | null
  exercices_a_faire: string | null
  /** Facultatif : départage deux séances d'un même jour. */
  heure_debut?: string
}

/** Position dans le texte, telle que renseignée un jour donné. */
export interface Position {
  date: string
  sourate: string | null
  versets_de: number | null
  versets_a: number | null
}

export interface ExerciceDonne {
  date: string
  exercices: string
}

export interface Progression {
  nbSeancesFaites: number
  nbNouvelles: number
  nbRevisions: number
  nbLectures: number
  derniereSeance: { date: string; contenu_aborde: string | null } | null
  /** Dernière séance où une position est renseignée, tous types confondus. */
  dernierePositionTravaillee: Position | null
  /**
   * Dernière position en **nouvelle mémorisation** : une révision ultérieure
   * d'un passage antérieur ne fait pas reculer ce repère.
   */
  derniereNouvelleMemorisation: Position | null
  dernierExerciceDonne: ExerciceDonne | null
  /** Ce que l'écran met en avant selon le type de cours. */
  miseEnAvant: 'contenu' | 'position'
}

/** Ordre chronologique croissant ; l'heure départage un même jour. */
function comparerSeances(a: SeanceProgression, b: SeanceProgression): number {
  return (
    a.date.localeCompare(b.date) || (a.heure_debut ?? '').localeCompare(b.heure_debut ?? '')
  )
}

/** Une séance porte une position dès qu'une sourate ou un verset est renseigné. */
function porteUnePosition(seance: SeanceProgression): boolean {
  return (
    (seance.sourate !== null && seance.sourate.trim() !== '') ||
    seance.versets_de !== null ||
    seance.versets_a !== null
  )
}

function versPosition(seance: SeanceProgression): Position {
  return {
    date: seance.date,
    sourate: seance.sourate,
    versets_de: seance.versets_de,
    versets_a: seance.versets_a,
  }
}

function exerciceNonVide(seance: SeanceProgression): boolean {
  return seance.exercices_a_faire !== null && seance.exercices_a_faire.trim() !== ''
}

/**
 * Le bloc mis en avant dépend du type de cours : le contenu libre pour
 * l'initiation (leçon, page de méthode), la position pour la lecture et la
 * mémorisation. « Initiation à la lecture du Coran » contient « lecture » :
 * l'exclusion passe donc en premier.
 */
export function miseEnAvantPour(
  typeCoursLibelle: string | null | undefined
): 'contenu' | 'position' {
  if (!typeCoursLibelle) return 'contenu'
  if (/initiation/i.test(typeCoursLibelle)) return 'contenu'

  return /lecture|m[ée]morisation/i.test(typeCoursLibelle) ? 'position' : 'contenu'
}

/**
 * Progression d'un apprenant dans un cours, à partir de ses séances.
 * Seules les séances de statut `faite` comptent : une séance annulée, reportée
 * ou marquée absence n'est pas un acquis.
 */
export function calculerProgression(
  seances: readonly SeanceProgression[],
  typeCoursLibelle: string | null | undefined
): Progression {
  const faites = seances
    .filter((seance) => seance.statut === STATUT_FAITE)
    .slice()
    .sort(comparerSeances)

  const derniere = faites.at(-1) ?? null

  const avecPosition = faites.filter(porteUnePosition)
  const nouvellesMemorisations = avecPosition.filter(
    (seance) => seance.type_travail === 'nouvelle_memorisation'
  )
  const avecExercice = faites.filter(exerciceNonVide)
  const dernierExercice = avecExercice.at(-1) ?? null

  return {
    nbSeancesFaites: faites.length,
    nbNouvelles: faites.filter((s) => s.type_travail === 'nouvelle_memorisation').length,
    nbRevisions: faites.filter((s) => s.type_travail === 'revision').length,
    nbLectures: faites.filter((s) => s.type_travail === 'lecture').length,
    derniereSeance: derniere
      ? { date: derniere.date, contenu_aborde: derniere.contenu_aborde }
      : null,
    dernierePositionTravaillee: avecPosition.at(-1)
      ? versPosition(avecPosition.at(-1) as SeanceProgression)
      : null,
    derniereNouvelleMemorisation: nouvellesMemorisations.at(-1)
      ? versPosition(nouvellesMemorisations.at(-1) as SeanceProgression)
      : null,
    dernierExerciceDonne: dernierExercice
      ? { date: dernierExercice.date, exercices: dernierExercice.exercices_a_faire as string }
      : null,
    miseEnAvant: miseEnAvantPour(typeCoursLibelle),
  }
}

/**
 * Exercices donnés la fois précédente, à vérifier au début de la séance
 * suivante — c'est le chaînage « donné → vérifié » du CLAUDE.md §6.
 *
 * @param avantDate limite la recherche aux séances **strictement antérieures**
 *   à cette date. Omise, renvoie le dernier exercice donné tout court.
 */
export function exercicesAVerifier(
  seances: readonly SeanceProgression[],
  avantDate?: string
): ExerciceDonne | null {
  const candidates = seances
    .filter(
      (seance) =>
        seance.statut === STATUT_FAITE &&
        exerciceNonVide(seance) &&
        (avantDate === undefined || seance.date < avantDate)
    )
    .slice()
    .sort(comparerSeances)

  const derniere = candidates.at(-1)

  return derniere
    ? { date: derniere.date, exercices: derniere.exercices_a_faire as string }
    : null
}

/** « Al-Fatiha, versets 1 à 7 » — libellé lisible d'une position. */
export function formaterPosition(position: Position): string {
  const morceaux: string[] = []

  if (position.sourate) morceaux.push(position.sourate)

  if (position.versets_de !== null && position.versets_a !== null) {
    morceaux.push(
      position.versets_de === position.versets_a
        ? `verset ${position.versets_de}`
        : `versets ${position.versets_de} à ${position.versets_a}`
    )
  } else if (position.versets_de !== null) {
    morceaux.push(`à partir du verset ${position.versets_de}`)
  } else if (position.versets_a !== null) {
    morceaux.push(`jusqu'au verset ${position.versets_a}`)
  }

  return morceaux.join(', ')
}
