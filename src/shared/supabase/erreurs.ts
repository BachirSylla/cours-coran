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
    /*
     * Exceptions métier levées par nos propres fonctions. Leur message est
     * rédigé en français côté base, à l'endroit qui connaît la règle : on le
     * remonte tel quel plutôt que de le préfixer d'un contexte qui le
     * dédoublerait (« Retrait du membre : Un centre doit garder… »).
     *
     * Ajouter le code ici est la dernière étape de toute nouvelle règle. Un
     * oubli ne casse rien — le message s'affiche préfixé — mais se lit mal.
     */
    case 'P0001': // enregistrer_cours : cours sans créneau (0002)
    case 'P0002': // enregistrer_cours : cours introuvable
    case 'P0003': // enregistrer_cours : chevauchement de créneaux
    case 'P0004': // membre : dernier responsable (0012)
    case 'P0010': // invitation : réservée au responsable (0016)
    case 'P0011': // invitation : code invalide, expiré, utilisé ou révoqué
    case 'P0012': // invitation : le compte appartient déjà à un centre
    case 'P0020': // autonomie : ce n'est pas votre cours (0017)
    case 'P0030': // retrait : droit refusé, ou soi-même (0018)
    case 'P0031': // retrait : cible invalide — hors centre, inexistante, ou le partant
    case 'P0032': // retrait : dernier responsable
    case 'P0033': // retrait : la réaffectation créerait un chevauchement
    case 'P0040': // suivi apprenant : ce n'est pas votre cours (0019)
    case 'P0050': // présence sur une séance non tenue (0020)
    case 'P0051': // séance quittant « faite » alors qu'elle porte des présences
    case 'P0060': // cours sans session (0022)
    case 'P0061': // session clôturée : ni création, ni modification, ni déplacement
    case 'P0062': // session clôturée : ni séance, ni présence, ni note (0023)
    case 'P0070': // reconduction : réservée au responsable de ce centre (0024)
    case 'P0071': // reconduction : nom, dates, ou nom déjà pris
    case 'P0072': // reconduction : la source contient un chevauchement
    case 'P0073': // reconduction : un cours de la source n'a aucun créneau
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
