import { getSupabaseClient } from '@/shared/supabase/client'
import { lancerSiErreur } from '@/shared/supabase/erreurs'
import type { Bareme } from '@/shared/lib/evaluations'
import type { Database } from '@/shared/supabase/types'

/**
 * Paramètres du compte — **une seule ligne par enseignant** (`owner_id` unique).
 *
 * Aucune ligne n'existe tant que les valeurs par défaut conviennent : `get()`
 * retombe alors sur `BAREME_PAR_DEFAUT`. Même persistance paresseuse que les
 * séances et les mois dus — on n'écrit qu'à partir du moment où l'utilisateur
 * a réellement choisi quelque chose.
 */
type TableParametres = Database['public']['Tables']['parametres']

export type Parametres = TableParametres['Row']

/** Barème retenu tant que l'enseignant n'en a pas choisi un autre. */
export const BAREME_PAR_DEFAUT: Bareme = 20

/** Ce que l'application lit, que la ligne existe ou non. */
export interface ParametresEffectifs {
  note_bareme: number
  /** `false` quand les valeurs viennent des défauts, sans ligne en base. */
  enregistres: boolean
}

export async function get(): Promise<ParametresEffectifs> {
  const { data, error } = await getSupabaseClient().from('parametres').select('*').maybeSingle()

  lancerSiErreur(error, 'Chargement des paramètres')

  return data
    ? { note_bareme: data.note_bareme, enregistres: true }
    : { note_bareme: BAREME_PAR_DEFAUT, enregistres: false }
}

/**
 * Fixe le barème. Idempotent : l'unicité d'`owner_id` fait que le second appel
 * met à jour la ligne au lieu d'en créer une seconde. `owner_id` est posé par
 * la base.
 */
export async function upsert(noteBareme: Bareme): Promise<Parametres> {
  const { data, error } = await getSupabaseClient()
    .from('parametres')
    .upsert({ note_bareme: noteBareme }, { onConflict: 'owner_id' })
    .select('*')
    .single()

  lancerSiErreur(error, 'Enregistrement des paramètres')

  return data
}
