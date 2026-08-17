/**
 * Construction des liens de partage — module **pur** (ni React, ni `window`).
 *
 * L'origine est passée en argument plutôt que lue depuis `window.location` :
 * c'est ce qui rend ces fonctions testables, et ce qui évite d'inventer un
 * domaine en dur qui deviendrait faux au prochain déploiement.
 */

/** Chemin de la route publique, partagé avec `app/router.tsx`. */
export const CHEMIN_PARTAGE = '/c'

/** `https://exemple.app/c/<jeton>` */
export function urlPartage(origine: string, jeton: string): string {
  // Une origine avec barre finale produirait `//c/…`, que certains proxys
  // normalisent et d'autres non.
  return `${origine.replace(/\/+$/, '')}${CHEMIN_PARTAGE}/${jeton}`
}

/**
 * Lien de partage WhatsApp. `wa.me` sans numéro ouvre le sélecteur de contact :
 * l'enseignant choisit le destinataire dans WhatsApp, l'application n'a donc
 * besoin d'aucun numéro de téléphone.
 */
export function lienWhatsApp(url: string, libelle: string): string {
  const texte = `${libelle} — voici le lien du cours : ${url}`

  return `https://wa.me/?text=${encodeURIComponent(texte)}`
}
