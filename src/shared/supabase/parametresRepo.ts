import { getSupabaseClient } from '@/shared/supabase/client'
import { lancerSiErreur } from '@/shared/supabase/erreurs'
import type { Bareme } from '@/shared/lib/evaluations'
import {
  estBaseAcademique,
  NOTATION_PAR_DEFAUT,
  type ConfigNotation,
} from '@/shared/lib/rapport'
import type { Database } from '@/shared/supabase/types'

/**
 * Paramètres du compte — **une seule ligne par enseignant** (`owner_id` unique).
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
  Omit<TableParametres['Insert'], 'id' | 'owner_id' | 'created_at' | 'updated_at'>
>

/** Ce que l'application lit, que la ligne existe ou non. */
export interface ParametresEffectifs extends ConfigNotation {
  /** Barème des notes de récitation, séance par séance. */
  note_bareme: number
  /** `false` quand les valeurs viennent des défauts, sans ligne en base. */
  enregistres: boolean
}

export async function get(): Promise<ParametresEffectifs> {
  const { data, error } = await getSupabaseClient().from('parametres').select('*').maybeSingle()

  lancerSiErreur(error, 'Chargement des paramètres')

  if (!data) {
    return { note_bareme: BAREME_PAR_DEFAUT, ...NOTATION_PAR_DEFAUT, enregistres: false }
  }

  return {
    note_bareme: data.note_bareme,
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
 * Enregistre un réglage. Idempotent : l'unicité d'`owner_id` fait que le second
 * appel met à jour la ligne au lieu d'en créer une seconde. `owner_id` est posé
 * par la base.
 *
 * Le patch est **partiel** : régler le barème de récitation ne réinitialise pas
 * la configuration de la notation finale, et réciproquement.
 */
export async function upsert(patch: ParametresPatch): Promise<Parametres> {
  const { data, error } = await getSupabaseClient()
    .from('parametres')
    .upsert(patch, { onConflict: 'owner_id' })
    .select('*')
    .single()

  lancerSiErreur(error, 'Enregistrement des paramètres')

  return data
}
