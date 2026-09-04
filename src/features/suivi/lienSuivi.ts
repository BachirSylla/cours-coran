/**
 * Construction des liens de suivi — module **pur** (ni React, ni `window`).
 *
 * Frère de `features/partage/lienPartage.ts`, et volontairement séparé de lui :
 * les deux liens ne mènent pas au même endroit et ne se disent pas de la même
 * façon. Celui-ci porte les notes d'**une** personne — le message qui
 * l'accompagne doit dire qu'il est privé, là où le lien de cours s'envoie à
 * toute la classe.
 */

/** Chemin de la route publique, partagé avec `app/router.tsx`. */
export const CHEMIN_SUIVI = '/suivi'

/** `https://exemple.app/suivi/<jeton>` */
export function urlSuivi(origine: string, jeton: string): string {
  // Une origine avec barre finale produirait `//suivi/…`, que certains proxys
  // normalisent et d'autres non.
  return `${origine.replace(/\/+$/, '')}${CHEMIN_SUIVI}/${jeton}`
}

/**
 * Lien de partage WhatsApp. `wa.me` sans numéro ouvre le sélecteur de contact :
 * l'enseignant choisit le destinataire dans WhatsApp, l'application n'a donc
 * besoin d'aucun numéro de téléphone.
 *
 * Le message nomme l'apprenant — c'est ce qui évite d'envoyer le lien d'Aïcha à
 * Omar — et rappelle qu'il est personnel : qui l'a, voit.
 *
 * ⚠️ Il ne nomme **plus le cours** depuis 0025. Le lien montre tout le parcours
 * de son porteur, tous cours confondus : annoncer « — Coran niveau 3 » laissait
 * croire que la page s'arrête là, et le destinataire n'aurait pas su qu'il en
 * reçoit davantage. Dire moins, mais juste.
 */
export function lienWhatsAppSuivi(url: string, apprenant: string): string {
  const texte =
    `Suivi de ${apprenant} : ${url}\n` +
    'Vous y trouverez ses notes de récitation et son assiduité, pour tous ses cours.\n' +
    'Ce lien est personnel, merci de ne pas le transmettre.'

  return `https://wa.me/?text=${encodeURIComponent(texte)}`
}
