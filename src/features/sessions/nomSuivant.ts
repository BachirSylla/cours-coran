/**
 * Suggestion de nom pour la session suivante — module **pur**.
 *
 * Les centres numérotent leurs sessions : « Session 17 » appelle « Session 18 ».
 * Ce n'est qu'une proposition, entièrement modifiable — mais la bonne
 * proposition évite une saisie à chaque reconduction, et surtout évite les
 * doublons de numérotation.
 *
 * On incrémente le **dernier** nombre du libellé, pas le premier : dans
 * « Coran 2026 Session 17 », c'est 17 qui change, pas 2026.
 */

/** Dernier groupe de chiffres du libellé. */
const DERNIER_NOMBRE = /(\d+)(\D*)$/

export function nomSuivant(nom: string): string {
  const base = nom.trim()

  if (base === '') return ''

  const trouve = DERNIER_NOMBRE.exec(base)

  if (!trouve) {
    /*
     * Aucun nombre : on ne peut rien deviner d'utile, et une suggestion fausse
     * est pire que pas de suggestion — elle se garde telle quelle. On rend donc
     * la main : le champ est obligatoire, l'utilisateur nommera lui-même.
     *
     * Le cas est courant, et c'est justement pourquoi il compte : « Session en
     * cours » est le nom que le backfill de 0022 donne à tout centre, donc ce
     * que verra toute PREMIÈRE reconduction.
     */
    return ''
  }

  const [entier, chiffres, apres] = trouve as unknown as [string, string, string]

  /*
   * Au-delà de la précision entière de JavaScript, incrémenter DÉCRÉMENTE :
   * `20250901123456789 + 1` rend `20250901123456788`. Hors d'atteinte en
   * pratique, mais une suggestion fausse et silencieuse est le pire des
   * comportements — on préfère ne rien proposer.
   */
  if (!Number.isSafeInteger(Number(chiffres))) return ''

  const suivant = String(Number(chiffres) + 1)

  /*
   * Le zéro de tête est conservé s'il y en avait un : « Session 09 » donne
   * « Session 10 », mais « Session 08 » donne « Session 09 » et non « Session 9 ».
   * Une numérotation qui perd son alignement se trie mal.
   */
  const aligne = chiffres.startsWith('0') ? suivant.padStart(chiffres.length, '0') : suivant

  return base.slice(0, base.length - entier.length) + aligne + apres
}
