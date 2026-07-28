import type { PostgrestError } from '@supabase/supabase-js'

/**
 * Erreur remontée par la couche repository, exploitable telle quelle dans l'UI :
 * `message` est en français, `code` reste disponible pour un traitement fin.
 */
export class ErreurSupabase extends Error {
  readonly code: string | undefined
  readonly details: string | undefined
  readonly hint: string | undefined

  constructor(message: string, source?: PostgrestError) {
    super(message)
    this.name = 'ErreurSupabase'
    this.code = source?.code
    this.details = source?.details ?? undefined
    this.hint = source?.hint ?? undefined
  }
}

/** Traduit les codes Postgres/PostgREST les plus courants en message lisible. */
function messageLisible(erreur: PostgrestError, contexte: string): string {
  switch (erreur.code) {
    // Exceptions levées par la fonction public.enregistrer_cours (migration 0002).
    // Leur message est déjà rédigé en français côté base : on le remonte tel quel.
    case 'P0001':
    case 'P0002':
    case 'P0003':
      return erreur.message
    case '23505':
      return `${contexte} : cet enregistrement existe déjà.`
    case '23503':
      return `${contexte} : un élément lié est introuvable ou encore utilisé.`
    case '23514':
      return `${contexte} : une valeur ne respecte pas les règles de la base.`
    case '23502':
      return `${contexte} : un champ obligatoire est manquant.`
    case '42501':
      return `${contexte} : accès refusé. Vérifiez que vous êtes bien connecté.`
    case 'PGRST301':
      return 'Session expirée. Reconnectez-vous.'
    default:
      return `${contexte} : ${erreur.message}`
  }
}

/**
 * Lève une `ErreurSupabase` si la requête a échoué.
 * À appeler dans chaque fonction de repository.
 */
export function lancerSiErreur(
  erreur: PostgrestError | null,
  contexte: string
): asserts erreur is null {
  if (erreur) {
    throw new ErreurSupabase(messageLisible(erreur, contexte), erreur)
  }
}
