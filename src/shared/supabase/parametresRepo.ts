import { getSupabaseClient } from '@/shared/supabase/client'
import { lancerSiErreur } from '@/shared/supabase/erreurs'
import * as membreRepo from '@/shared/supabase/membreRepo'
import type { Bareme } from '@/shared/lib/evaluations'
import {
  estModeFacturation,
  MODE_FACTURATION_PAR_DEFAUT,
  type ModeFacturation,
} from '@/shared/lib/facturation'
import {
  estBaseAcademique,
  NOTATION_PAR_DEFAUT,
  type ConfigNotation,
} from '@/shared/lib/rapport'
import type { Database } from '@/shared/supabase/types'

/**
 * Réglages du centre — **une seule ligne par centre** (`centre_id` unique,
 * migration 0012). Tout membre les lit ; seul le responsable les écrit.
 *
 * Aucune ligne n'existe tant que les valeurs par défaut conviennent : `get()`
 * retombe alors sur `BAREME_PAR_DEFAUT` et `NOTATION_PAR_DEFAUT`. Même
 * persistance paresseuse que les séances et les mois dus — on n'écrit qu'à
 * partir du moment où l'utilisateur a réellement choisi quelque chose.
 */
type TableParametres = Database['public']['Tables']['parametres']

export type Parametres = TableParametres['Row']

/** Barème retenu tant que l'enseignant n'en a pas choisi un autre. */
export const BAREME_PAR_DEFAUT: Bareme = 20

/** Champs réglables. Un patch partiel ne touche que ce qu'il contient. */
export type ParametresPatch = Partial<
  Omit<TableParametres['Insert'], 'id' | 'centre_id' | 'created_at' | 'updated_at'>
>

/** Ce que l'application lit, que la ligne existe ou non. */
export interface ParametresEffectifs extends ConfigNotation {
  /**
   * Barème des notes de récitation, séance par séance.
   *
   * Il vient du membre connecté quand il en a choisi un — c'est son outil de
   * travail, pas une règle du centre — et retombe sinon sur celui du centre
   * (migration 0012).
   */
  note_bareme: number
  /** Logo du centre, data URL, ou `null` s'il n'y en a pas (migration 0010). */
  logo: string | null
  /**
   * Rythme de facturation du centre (migration 0026).
   *
   * ⚠️ Le défaut est `mensuel`, ici comme en base, et les deux doivent rester
   * d'accord : un centre sans ligne `parametres` doit se comporter exactement
   * comme avant la migration, sans quoi la rétro-compatibilité ne tient que du
   * côté serveur.
   */
  mode_facturation: ModeFacturation
  /** `false` quand les valeurs viennent des défauts, sans ligne en base. */
  enregistres: boolean
}

/**
 * Réglages applicables ici et maintenant.
 *
 * `userId` sert à récupérer le barème de récitation propre à l'enseignant. Il
 * est facultatif : sans lui, c'est celui du centre qui s'applique — le
 * comportement d'avant la migration 0012.
 */
export async function get(userId?: string | null): Promise<ParametresEffectifs> {
  const [{ data, error }, membre] = await Promise.all([
    getSupabaseClient().from('parametres').select('*').maybeSingle(),
    userId ? membreRepo.getCourant(userId) : Promise.resolve(null),
  ])

  lancerSiErreur(error, 'Chargement des paramètres')

  const baremeDuMembre = membre?.note_bareme ?? null

  if (!data) {
    return {
      note_bareme: baremeDuMembre ?? BAREME_PAR_DEFAUT,
      logo: null,
      mode_facturation: MODE_FACTURATION_PAR_DEFAUT,
      ...NOTATION_PAR_DEFAUT,
      // Le barème du membre ne compte pas comme un réglage du centre : c'est ce
      // dernier que ce drapeau décrit.
      enregistres: false,
    }
  }

  return {
    note_bareme: baremeDuMembre ?? data.note_bareme,
    logo: data.logo,
    /*
     * Refermée sur le domaine, comme `base_academique` : les types générés
     * annoncent `string`, et une valeur inconnue doit retomber sur le mode par
     * défaut plutôt que de faire facturer n'importe quoi.
     */
    mode_facturation: estModeFacturation(data.mode_facturation)
      ? data.mode_facturation
      : MODE_FACTURATION_PAR_DEFAUT,
    assiduite_active: data.assiduite_active,
    // La base est une chaîne côté types générés : on la referme sur le domaine,
    // et une valeur inattendue retombe sur le défaut plutôt que de casser le
    // calcul de la note.
    base_academique: estBaseAcademique(data.base_academique)
      ? data.base_academique
      : NOTATION_PAR_DEFAUT.base_academique,
    bareme_academique: data.bareme_academique,
    bareme_assiduite: data.bareme_assiduite,
    penalite_absence: data.penalite_absence,
    penalite_retard: data.penalite_retard,
    penaliser_absences_excusees: data.penaliser_absences_excusees,
    enregistres: true,
  }
}

/**
 * Enregistre un réglage. Idempotent : l'unicité de `centre_id` fait que le
 * second appel met à jour la ligne au lieu d'en créer une seconde. `centre_id`
 * est posé par la base.
 *
 * ⚠️ `onConflict` est une chaîne littérale : ni TypeScript ni les types générés
 * ne la vérifient. Se tromper de colonne ici ne casse rien à la compilation et
 * crée une seconde ligne à l'exécution.
 *
 * Le patch est **partiel** : régler le barème de récitation ne réinitialise pas
 * la configuration de la notation finale, et réciproquement.
 */
export async function upsert(patch: ParametresPatch): Promise<Parametres> {
  const { data, error } = await getSupabaseClient()
    .from('parametres')
    .upsert(patch, { onConflict: 'centre_id' })
    .select('*')
    .single()

  lancerSiErreur(error, 'Enregistrement des paramètres')

  return data
}
