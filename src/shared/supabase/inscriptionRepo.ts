import { getSupabaseClient } from '@/shared/supabase/client'
import { ErreurSupabase, lancerSiErreur } from '@/shared/supabase/erreurs'
import type { Apprenant } from '@/shared/supabase/apprenantRepo'
import type { Session } from '@/shared/supabase/sessionRepo'
import type { Database } from '@/shared/supabase/types'

/**
 * Liaison apprenant ↔ cours — couche repository (CLAUDE.md §3).
 *
 * La capacité d'un cours (individuel = 1, groupe = 1..N) n'est **pas** vérifiée
 * ici : c'est une règle applicative tenue par
 * `features/inscriptions/reglesInscription.ts` (CLAUDE.md §5.7).
 * `centre_id` est posé par la base via `default centre_courant()`.
 */
type TableInscription = Database['public']['Tables']['inscription']

export type Inscription = TableInscription['Row']
type Cours = Database['public']['Tables']['cours']['Row']
type Creneau = Database['public']['Tables']['creneau']['Row']

/** Inscription vue depuis un cours : qui est inscrit. */
export type InscriptionAvecApprenant = Inscription & {
  apprenant: Apprenant | null
}

/**
 * Inscription vue depuis un apprenant : à quoi il est inscrit.
 *
 * La **session** accompagne le cours depuis 0025 : la fiche interne doit montrer
 * un parcours, et sans elle « Coran niveau 1 » et « Coran niveau 2 » se lisent
 * comme deux cours simultanés au lieu d'une progression.
 */
export type SessionDuCours = Pick<Session, 'id' | 'nom' | 'date_debut' | 'date_fin' | 'statut'>

export type InscriptionAvecCours = Inscription & {
  cours:
    | (Cours & {
        type_cours: { libelle: string } | null
        creneau: Creneau[]
        session: SessionDuCours | null
      })
    | null
}

export async function listByCours(coursId: string): Promise<InscriptionAvecApprenant[]> {
  const { data, error } = await getSupabaseClient()
    .from('inscription')
    .select('*, apprenant(*)')
    .eq('cours_id', coursId)

  lancerSiErreur(error, 'Chargement des apprenants du cours')

  return (data ?? []).sort((a, b) =>
    `${a.apprenant?.nom ?? ''} ${a.apprenant?.prenom ?? ''}`.localeCompare(
      `${b.apprenant?.nom ?? ''} ${b.apprenant?.prenom ?? ''}`,
      'fr'
    )
  )
}

export async function listByApprenant(apprenantId: string): Promise<InscriptionAvecCours[]> {
  const { data, error } = await getSupabaseClient()
    .from('inscription')
    .select(
      '*, cours(*, type_cours(libelle), creneau(*), session(id, nom, date_debut, date_fin, statut))'
    )
    .eq('apprenant_id', apprenantId)

  lancerSiErreur(error, "Chargement des cours de l'apprenant")

  /*
   * Du plus RÉCENT au plus ancien : la fiche s'ouvre sur ce que l'apprenant suit
   * aujourd'hui, et l'historique se déroule dessous.
   *
   * ⚠️ **L'identifiant de session départage AVANT le libellé du cours.** Sans lui,
   * deux sessions de même `date_debut` — que rien n'interdit, une session de
   * rattrapage n'attend pas la fin de la précédente (§5.15) — s'entrelacent :
   * `Alif (S17) · Mim (Rattrapage) · Zoulou (S17)`. Le regroupement de la fiche
   * ne réunit que les suites CONSÉCUTIVES, si bien qu'une même session
   * s'afficherait deux fois, sous deux en-têtes, avec la même clé React.
   *
   * Trier par session d'abord n'est donc pas un confort de présentation : c'est
   * ce qui rend le regroupement correct. Une session sans date passe en dernier
   * plutôt qu'en tête, faute de savoir où la placer.
   */
  return (data ?? []).sort(comparerParcours)
}

/**
 * L'ordre du parcours d'un apprenant. Exporté pour être éprouvé : c'est lui qui
 * rend le regroupement par session correct, et son défaut ne se voit qu'avec
 * deux sessions de même date de début.
 */
export function comparerParcours(a: InscriptionAvecCours, b: InscriptionAvecCours): number {
  const parDate = (b.cours?.session?.date_debut ?? '').localeCompare(
    a.cours?.session?.date_debut ?? ''
  )
  if (parDate !== 0) return parDate

  const parSession = (a.cours?.session?.id ?? '').localeCompare(b.cours?.session?.id ?? '')
  if (parSession !== 0) return parSession

  const parLibelle = (a.cours?.libelle ?? '').localeCompare(b.cours?.libelle ?? '', 'fr')
  if (parLibelle !== 0) return parLibelle

  return a.id.localeCompare(b.id)
}

export async function ajouter(apprenantId: string, coursId: string): Promise<Inscription> {
  const { data, error } = await getSupabaseClient()
    .from('inscription')
    .insert({ apprenant_id: apprenantId, cours_id: coursId })
    .select('*')
    .single()

  // La contrainte unique (apprenant_id, cours_id) mérite un message précis.
  if (error?.code === '23505') {
    throw new ErreurSupabase('Cet apprenant est déjà inscrit à ce cours.', error)
  }
  lancerSiErreur(error, "Inscription de l'apprenant")

  return data
}

/** Note d'examen de fin de session. Les deux champs vont ensemble. */
export interface ExamenInput {
  note_examen: number | null
  examen_bareme: number | null
}

/**
 * Enregistre la note d'examen d'un apprenant pour un cours (migration 0008).
 *
 * Le barème accompagne la note, comme pour les récitations : changer de réglage
 * plus tard ne doit pas réinterpréter une note déjà donnée. La base refuse
 * d'ailleurs une note sans son barème (`inscription_note_examen_coherente`).
 * Effacer une note se fait en passant les deux champs à `null`.
 *
 * Passe par une RPC depuis la migration 0017 : l'examen relève de **l'enseignant
 * du cours**, et les deux colonnes sont sorties des `grant` d'`inscription` —
 * ni lui ni le responsable ne les écrivent directement. La fonction remonte
 * elle-même de l'inscription à son cours pour vérifier qui appelle : le client
 * ne nomme jamais le cours, donc ne peut pas le forcer.
 */
export async function noterExamen(inscriptionId: string, examen: ExamenInput): Promise<void> {
  // Les arguments d'une fonction Postgres ne portent pas de nullabilité : les
  // types générés les déclarent `number`, alors que `null` est précisément la
  // façon d'effacer une note. La conversion est ici, à un seul endroit.
  const { error } = await getSupabaseClient().rpc('noter_examen', {
    p_inscription_id: inscriptionId,
    p_note: examen.note_examen as number,
    p_bareme: examen.examen_bareme as number,
  })

  lancerSiErreur(error, "Enregistrement de la note d'examen")
}

/**
 * Suivi privé d'un apprenant (migration 0019) — trois RPC, jamais d'écriture
 * directe.
 *
 * `inscription.jeton` n'est accordée à personne en écriture : le secret est
 * tiré par le CSPRNG du serveur, le navigateur ne le choisit jamais. Comme pour
 * l'examen, chaque fonction remonte elle-même de l'inscription à son cours pour
 * vérifier que l'appelant l'anime — le client ne nomme jamais le cours, donc ne
 * peut pas le forcer.
 */

/** Ouvre le suivi et renvoie le jeton. Idempotent : ne remplace pas un lien actif. */
export async function activerSuivi(inscriptionId: string): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc('activer_suivi', {
    p_inscription_id: inscriptionId,
  })

  lancerSiErreur(error, 'Ouverture du suivi')

  return data
}

/** Fait tourner le jeton : le lien déjà distribué cesse de fonctionner. */
export async function regenererSuivi(inscriptionId: string): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc('regenerer_suivi', {
    p_inscription_id: inscriptionId,
  })

  lancerSiErreur(error, 'Régénération du lien de suivi')

  return data
}

/** Ferme le suivi : le lien ne renvoie plus rien. */
export async function revoquerSuivi(inscriptionId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('revoquer_suivi', {
    p_inscription_id: inscriptionId,
  })

  lancerSiErreur(error, 'Fermeture du suivi')
}

/**
 * Ferme **tous** les liens de suivi d'un apprenant dans le centre, et rend le
 * nombre réellement fermé (migration 0025).
 *
 * ⚠️ `revoquerSuivi` ne suffit plus à couper l'accès. Depuis 0025, n'importe
 * lequel des jetons d'un apprenant ouvre son parcours ENTIER : fermer le lien
 * d'un cours laisse celui d'un autre tout montrer. C'est la contrepartie du
 * lien unique, et il faut un geste qui les ferme tous.
 */
export async function revoquerSuiviApprenant(apprenantId: string): Promise<number> {
  const { data, error } = await getSupabaseClient().rpc('revoquer_suivi_apprenant', {
    p_apprenant_id: apprenantId,
  })

  lancerSiErreur(error, 'Fermeture des liens de suivi')

  return data ?? 0
}

/** Retire l'apprenant du cours — **et supprime sa note d'examen avec la ligne**. */
export async function retirer(inscriptionId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('inscription')
    .delete()
    .eq('id', inscriptionId)

  lancerSiErreur(error, "Retrait de l'apprenant")
}
