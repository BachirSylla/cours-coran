import { describe, expect, it } from 'vitest'

import {
  chercherSourates,
  libelleSourate,
  normaliserRecherche,
  SOURATE_PAR_NUMERO,
  SOURATES,
  trouverParNom,
  trouverParNumero,
} from '@/shared/data/sourates'

/**
 * Repères vérifiés un par un. Un test ne peut pas prouver qu'une
 * translittération est juste — mais il rend visible un décalage d'indice ou
 * une réécriture accidentelle de la liste, qui est le risque réel.
 */
const REPERES: Record<number, string> = {
  1: 'Al-Fâtiha',
  2: 'Al-Baqara',
  18: 'Al-Kahf',
  36: 'Yâ-Sîn',
  55: 'Ar-Rahmân',
  67: 'Al-Mulk',
  78: "An-Naba'",
  108: 'Al-Kawthar',
  112: 'Al-Ikhlâs',
  113: 'Al-Falaq',
  114: 'An-Nâs',
}

describe('SOURATES — structure', () => {
  it('contient exactement 114 entrées', () => {
    expect(SOURATES).toHaveLength(114)
  })

  it('a des numéros contigus de 1 à 114, dans l’ordre canonique', () => {
    expect(SOURATES.map((s) => s.numero)).toEqual(
      Array.from({ length: 114 }, (_, index) => index + 1)
    )
  })

  it('n’a aucun numéro en double', () => {
    expect(new Set(SOURATES.map((s) => s.numero)).size).toBe(114)
  })

  it('n’a aucun nom en double', () => {
    expect(new Set(SOURATES.map((s) => s.nom)).size).toBe(114)
    expect(new Set(SOURATES.map((s) => s.nomArabe)).size).toBe(114)
  })

  it('n’a aucun champ vide', () => {
    for (const sourate of SOURATES) {
      expect(sourate.nom.trim()).not.toBe('')
      expect(sourate.nomArabe.trim()).not.toBe('')
    }
  })

  it('place les sourates repères au bon numéro', () => {
    for (const [numero, nom] of Object.entries(REPERES)) {
      expect(SOURATE_PAR_NUMERO.get(Number(numero))?.nom).toBe(nom)
    }
  })

  it('expose un index complet par numéro', () => {
    expect(SOURATE_PAR_NUMERO.size).toBe(114)
  })
})

describe('normaliserRecherche', () => {
  it('supprime les accents et passe en minuscules', () => {
    expect(normaliserRecherche('Al-Fâtiha')).toBe('alfatiha')
    expect(normaliserRecherche('AL-FÂTIHA')).toBe('alfatiha')
    expect(normaliserRecherche('Yâ-Sîn')).toBe('yasin')
  })

  it('retire apostrophes, tirets et espaces', () => {
    expect(normaliserRecherche("Âl-'Imrân")).toBe('alimran')
    expect(normaliserRecherche('al imran')).toBe('alimran')
    expect(normaliserRecherche("An-Naba'")).toBe('annaba')
  })

  it('gère l’apostrophe typographique', () => {
    expect(normaliserRecherche('Al-Mâ’ida')).toBe(normaliserRecherche("Al-Mâ'ida"))
  })
})

describe('chercherSourates — par nom', () => {
  it('trouve par fragment de nom', () => {
    expect(chercherSourates('baqar').map((s) => s.numero)).toEqual([2])
  })

  it('trouve sans les accents', () => {
    expect(chercherSourates('imran').map((s) => s.numero)).toEqual([3])
    expect(chercherSourates('yasin').map((s) => s.numero)).toEqual([36])
  })

  it('ignore la casse', () => {
    expect(chercherSourates('BAQARA').map((s) => s.numero)).toEqual([2])
  })

  it('ignore les tirets et espaces saisis', () => {
    expect(chercherSourates('al fatiha').map((s) => s.numero)).toEqual([1])
    expect(chercherSourates('al-fatiha').map((s) => s.numero)).toEqual([1])
  })

  it('peut renvoyer plusieurs résultats', () => {
    const resultats = chercherSourates('nas')
    expect(resultats.length).toBeGreaterThan(1)
    expect(resultats.map((s) => s.numero)).toContain(114)
  })

  it('préserve l’ordre canonique', () => {
    const numeros = chercherSourates('al').map((s) => s.numero)
    expect(numeros).toEqual([...numeros].sort((a, b) => a - b))
  })

  it('renvoie une liste vide sans correspondance', () => {
    expect(chercherSourates('zzzzz')).toEqual([])
  })
})

describe('chercherSourates — par nom arabe', () => {
  it('trouve par le nom arabe exact', () => {
    expect(chercherSourates('البقرة').map((s) => s.numero)).toEqual([2])
    expect(chercherSourates('الفاتحة').map((s) => s.numero)).toEqual([1])
  })

  it('trouve par fragment arabe', () => {
    expect(chercherSourates('الناس').map((s) => s.numero)).toContain(114)
  })
})

describe('chercherSourates — par numéro', () => {
  it('place la correspondance exacte en tête', () => {
    expect(chercherSourates('2')[0]?.numero).toBe(2)
    expect(chercherSourates('114')).toEqual([SOURATE_PAR_NUMERO.get(114)])
  })

  it('propose aussi les numéros commençant par la saisie', () => {
    const numeros = chercherSourates('1').map((s) => s.numero)

    expect(numeros[0]).toBe(1)
    expect(numeros).toContain(10)
    expect(numeros).toContain(114)
    expect(numeros).not.toContain(2)
  })

  it('ne renvoie rien pour un numéro hors plage', () => {
    expect(chercherSourates('115')).toEqual([])
    expect(chercherSourates('0')).toEqual([])
  })
})

describe('chercherSourates — requête vide', () => {
  it('renvoie les 114 sourates', () => {
    expect(chercherSourates('')).toHaveLength(114)
    expect(chercherSourates('   ')).toHaveLength(114)
  })
})

describe('trouverParNumero', () => {
  it('retrouve une sourate connue', () => {
    expect(trouverParNumero(36)?.nom).toBe('Yâ-Sîn')
  })

  it('renvoie undefined hors plage ou sans valeur', () => {
    expect(trouverParNumero(0)).toBeUndefined()
    expect(trouverParNumero(115)).toBeUndefined()
    expect(trouverParNumero(null)).toBeUndefined()
    expect(trouverParNumero(undefined)).toBeUndefined()
  })
})

describe('trouverParNom', () => {
  it('retrouve le nom canonique', () => {
    expect(trouverParNom('Al-Baqara')?.numero).toBe(2)
  })

  it('tolère une orthographe approchée — cas des séances déjà saisies', () => {
    expect(trouverParNom('al baqara')?.numero).toBe(2)
    expect(trouverParNom('AL-BAQARA')?.numero).toBe(2)
    expect(trouverParNom('al baqarah')?.numero).toBe(2)
    expect(trouverParNom('Baqara')?.numero).toBe(2)
  })

  it('renvoie undefined sur une valeur vide ou inconnue', () => {
    expect(trouverParNom(null)).toBeUndefined()
    expect(trouverParNom('')).toBeUndefined()
    expect(trouverParNom('   ')).toBeUndefined()
    expect(trouverParNom('Sourate inventée')).toBeUndefined()
  })

  it('refuse de trancher une correspondance ambiguë', () => {
    // « nas » correspond à plusieurs sourates : mieux vaut ne rien retrouver
    // que d'en choisir une au hasard.
    expect(chercherSourates('nas').length).toBeGreaterThan(1)
    expect(trouverParNom('nas')).toBeUndefined()
  })
})

describe('libelleSourate', () => {
  it('formate « numéro · nom »', () => {
    expect(libelleSourate(SOURATE_PAR_NUMERO.get(2)!)).toBe('2 · Al-Baqara')
    expect(libelleSourate(SOURATE_PAR_NUMERO.get(114)!)).toBe('114 · An-Nâs')
  })
})
