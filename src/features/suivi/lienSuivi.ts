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
 * la famille d'Omar — et rappelle qu'il est personnel : qui l'a, voit.
 */
export function lienWhatsAppSuivi(url: string, apprenant: string, cours: string): string {
  const texte =
    `Suivi de ${apprenant} — ${cours} : ${url}\n` +
    'Ce lien est personnel, merci de ne pas le transmettre.'

  return `https://wa.me/?text=${encodeURIComponent(texte)}`
}
