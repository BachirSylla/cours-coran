/**
 * Recherche plein texte dans une liste déjà chargée — module **pur**.
 *
 * Trois partis pris, parce qu'on cherche une personne comme on s'en souvient,
 * pas comme elle a été saisie :
 *
 *   * **ni accents ni casse** : « paulele » trouve « Pauléle », « KOREA »
 *     trouve « Koréa ». Les noms d'ici se tapent de dix façons sur un téléphone ;
 *   * **chaque mot, dans n'importe quel ordre** : « fall paulele » trouve
 *     « Pauléle Fall ». Un mot absent suffit à écarter la ligne — c'est ce qui
 *     rend la recherche plus précise à mesure qu'on tape, et non l'inverse ;
 *   * **un numéro se retrouve sans ses espaces** : « 78631 » trouve
 *     « +221 78 631 37 70 ». Personne ne retape les espaces d'un numéro.
 */

/** Minuscules, sans diacritiques, espaces réduits. */
export function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function chiffres(texte: string): string {
  return texte.replace(/\D/g, '')
}

/**
 * `true` quand chaque mot de la requête figure dans au moins un des champs.
 *
 * Une requête vide — ou faite d'espaces — laisse tout passer : effacer la
 * recherche doit rendre la liste entière, jamais une liste vide.
 *
 * Les champs `null` ou `undefined` sont ignorés : une fiche sans contact ne doit
 * ni planter, ni correspondre au mot « null ».
 */
export function correspond(
  requete: string,
  champs: readonly (string | number | null | undefined)[]
): boolean {
  const mots = normaliser(requete).split(' ').filter(Boolean)
  if (mots.length === 0) return true

  const presents = champs
    .filter((champ): champ is string | number => champ !== null && champ !== undefined)
    .map((champ) => String(champ))

  const texte = normaliser(presents.join(' '))
  const numeros = chiffres(presents.join(''))

  return mots.every((mot) => {
    if (texte.includes(mot)) return true

    /*
     * ⚠️ Seulement pour un mot FAIT de chiffres (au moins deux). Sans cette
     * garde, « a1 » serait réduit à « 1 » et trouverait tout numéro contenant
     * un 1 ; et un chiffre isolé trouverait presque toutes les fiches.
     */
    const motChiffres = chiffres(mot)

    return (
      motChiffres.length >= 2 &&
      motChiffres.length === mot.replace(/[\s+().-]/g, '').length &&
      numeros.includes(motChiffres)
    )
  })
}
