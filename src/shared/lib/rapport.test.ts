import { describe, expect, it } from 'vitest'

import {
  absencesPenalisees,
  compterPresence,
  estPresent,
  etatEffectif,
  libelleContenuSeance,
  moyenneRevisions,
  noteAcademique,
  noteAssiduite,
  noteFinale,
  NOTATION_PAR_DEFAUT,
  type ComptagePresence,
  type ConfigNotation,
  type EtatPresence,
  type LignePresence,
} from '@/shared/lib/rapport'

/** Ligne telle qu'écrite depuis la migration 0008 : l'état fait autorité. */
function ligne(etat: EtatPresence): LignePresence {
  return { etat, present: estPresent(etat) }
}

/** Ligne d'avant 0008 : seul le booléen existe. */
function ligneAncienne(present: boolean): LignePresence {
  return { etat: null, present }
}

function config(extra: Partial<ConfigNotation> = {}): ConfigNotation {
  return { ...NOTATION_PAR_DEFAUT, ...extra }
}

function comptage(extra: Partial<ComptagePresence> = {}): ComptagePresence {
  return { presences: 0, absences: 0, retards: 0, excusees: 0, partiels: 0, total: 0, ...extra }
}

describe('NOTATION_PAR_DEFAUT', () => {
  /**
   * Ces valeurs sont dupliquées dans les `default` de `parametres`
   * (migration 0008), parce qu'aucune ligne n'existe tant que l'enseignant n'a
   * rien réglé. Ce test est le seul garde-fou contre une dérive silencieuse :
   * si les deux divergent, les notes changent toutes seules le jour du premier
   * enregistrement.
   */
  it('reflète exactement les valeurs par défaut de la base', () => {
    expect(NOTATION_PAR_DEFAUT).toEqual({
      bareme_academique: 17,
      bareme_assiduite: 3,
      penalite_absence: 0.5,
      penalite_retard: 0.25,
      penaliser_absences_excusees: false,
    })
  })

  it('partage exactement les 20 points de la note finale', () => {
    expect(NOTATION_PAR_DEFAUT.bareme_academique + NOTATION_PAR_DEFAUT.bareme_assiduite).toBe(
      20
    )
  })
})

describe('estPresent', () => {
  it('compte présents ceux qui étaient là, même en retard ou à moitié', () => {
    expect(estPresent('present')).toBe(true)
    expect(estPresent('retard')).toBe(true)
    expect(estPresent('partiel')).toBe(true)
  })

  it('compte absents ceux qui n’étaient pas là, excusés ou non', () => {
    expect(estPresent('absent')).toBe(false)
    expect(estPresent('excuse')).toBe(false)
  })
})

describe('etatEffectif', () => {
  it('respecte l’état quand il est renseigné', () => {
    expect(etatEffectif({ etat: 'retard', present: true })).toBe('retard')
  })

  it('retombe sur le booléen quand l’état est absent', () => {
    expect(etatEffectif(ligneAncienne(true))).toBe('present')
    expect(etatEffectif(ligneAncienne(false))).toBe('absent')
  })

  it('retombe aussi sur le booléen devant un état inconnu', () => {
    // La base l'interdit, mais une valeur inattendue ne doit pas fausser un
    // bilan en silence.
    expect(etatEffectif({ etat: 'vacances', present: false })).toBe('absent')
  })
})

describe('compterPresence', () => {
  it('ne compte rien sur une liste vide', () => {
    expect(compterPresence([])).toEqual(comptage())
  })

  it('répartit chaque état dans la bonne colonne', () => {
    const resultat = compterPresence([
      ligne('present'),
      ligne('present'),
      ligne('retard'),
      ligne('partiel'),
      ligne('absent'),
      ligne('excuse'),
    ])

    expect(resultat).toEqual({
      presences: 4, // present ×2 + retard + partiel
      absences: 2, // absent + excuse
      retards: 1,
      excusees: 1,
      partiels: 1,
      total: 6,
    })
  })

  it('compte les lignes d’avant la migration via leur booléen', () => {
    const resultat = compterPresence([
      ligneAncienne(true),
      ligneAncienne(true),
      ligneAncienne(false),
    ])

    expect(resultat).toEqual(comptage({ presences: 2, absences: 1, total: 3 }))
  })

  it('mélange sans peine anciennes et nouvelles lignes', () => {
    const resultat = compterPresence([ligneAncienne(true), ligne('retard'), ligne('excuse')])

    expect(resultat).toEqual(
      comptage({ presences: 2, absences: 1, retards: 1, excusees: 1, total: 3 })
    )
  })

  it('range toujours chaque ligne d’un côté ou de l’autre', () => {
    const lignes = [
      ligne('present'),
      ligne('retard'),
      ligne('partiel'),
      ligne('absent'),
      ligne('excuse'),
      ligneAncienne(false),
    ]
    const resultat = compterPresence(lignes)

    expect(resultat.presences + resultat.absences).toBe(resultat.total)
    expect(resultat.total).toBe(lignes.length)
  })
})

describe('absencesPenalisees', () => {
  it('épargne les absences excusées par défaut', () => {
    // C'est ce qui donne un sens à marquer « excusé » plutôt qu'« absent ».
    expect(absencesPenalisees(comptage({ absences: 3, excusees: 2 }), config())).toBe(1)
  })

  it('les compte quand le réglage le demande', () => {
    expect(
      absencesPenalisees(
        comptage({ absences: 3, excusees: 2 }),
        config({ penaliser_absences_excusees: true })
      )
    ).toBe(3)
  })
})

describe('noteAssiduite', () => {
  it('donne le maximum à une assiduité parfaite', () => {
    expect(noteAssiduite(comptage({ presences: 12, total: 12 }), config())).toBe(3)
  })

  it('retire une pénalité par absence', () => {
    expect(noteAssiduite(comptage({ absences: 2, total: 12 }), config())).toBe(2)
  })

  it('retire une pénalité par retard', () => {
    expect(noteAssiduite(comptage({ retards: 2, total: 12 }), config())).toBe(2.5)
  })

  it('cumule absences et retards', () => {
    expect(noteAssiduite(comptage({ absences: 1, retards: 1, total: 12 }), config())).toBe(2.25)
  })

  it('ne descend jamais sous zéro', () => {
    // Dix absences valent −5 : la note reste 0, elle ne rogne pas la part
    // académique.
    expect(noteAssiduite(comptage({ absences: 10, total: 12 }), config())).toBe(0)
  })

  it('ne pénalise pas une absence excusée par défaut', () => {
    expect(noteAssiduite(comptage({ absences: 2, excusees: 2, total: 12 }), config())).toBe(3)
  })

  it('la pénalise quand le réglage le demande', () => {
    expect(
      noteAssiduite(
        comptage({ absences: 2, excusees: 2, total: 12 }),
        config({ penaliser_absences_excusees: true })
      )
    ).toBe(2)
  })

  it('ne pénalise jamais une présence partielle', () => {
    expect(noteAssiduite(comptage({ presences: 3, partiels: 3, total: 3 }), config())).toBe(3)
  })

  it('respecte un barème d’assiduité personnalisé', () => {
    const perso = config({ bareme_academique: 15, bareme_assiduite: 5, penalite_absence: 1 })

    expect(noteAssiduite(comptage({ absences: 2, total: 10 }), perso)).toBe(3)
    expect(noteAssiduite(comptage({ total: 10 }), perso)).toBe(5)
  })
})

describe('noteAcademique', () => {
  it('ramène un 16/20 sur le barème académique', () => {
    expect(noteAcademique(16, 20, 17)).toBe(13.6)
  })

  it('lit un 8/10 comme le 16/20 qu’il vaut', () => {
    expect(noteAcademique(8, 10, 17)).toBe(noteAcademique(16, 20, 17))
  })

  it('donne le maximum à un sans-faute', () => {
    expect(noteAcademique(20, 20, 17)).toBe(17)
    expect(noteAcademique(10, 10, 17)).toBe(17)
  })

  it('renvoie null quand l’examen n’a pas eu lieu', () => {
    // Pas 0 : un apprenant pas encore examiné n'a pas échoué.
    expect(noteAcademique(null, 20, 17)).toBeNull()
    expect(noteAcademique(15, null, 17)).toBeNull()
  })

  it('ne produit jamais NaN sur un barème absurde', () => {
    expect(noteAcademique(15, 0, 17)).toBe(0)
    expect(noteAcademique(15, 20, -1)).toBeNull()
  })
})

describe('noteFinale', () => {
  it('additionne les deux parts, sur 20', () => {
    // 16/20 → 13,6 sur 17 ; assiduité parfaite → 3.
    expect(noteFinale(16, 20, comptage({ presences: 10, total: 10 }), config())).toBe(16.6)
  })

  it('atteint 20 sur un parcours sans faute, et ne le dépasse pas', () => {
    expect(noteFinale(20, 20, comptage({ presences: 10, total: 10 }), config())).toBe(20)
  })

  it('tient compte des absences', () => {
    expect(noteFinale(20, 20, comptage({ absences: 2, total: 10 }), config())).toBe(19)
  })

  it('renvoie null tant qu’il n’y a pas de note d’examen', () => {
    expect(noteFinale(null, null, comptage({ presences: 10, total: 10 }), config())).toBeNull()
  })
})

describe('moyenneRevisions', () => {
  it('renvoie null sans aucune note', () => {
    expect(moyenneRevisions([])).toBeNull()
  })

  it('ramène une note unique sur 20', () => {
    expect(moyenneRevisions([{ note: 8, note_bareme: 10 }])).toBe(16)
  })

  it('reste juste sur un historique mêlant /10 et /20', () => {
    // 8/10 vaut 80 %, 12/20 vaut 60 % : moyenne 70 %, soit 14/20. Une moyenne
    // des notes brutes aurait donné 10.
    expect(
      moyenneRevisions([
        { note: 8, note_bareme: 10 },
        { note: 12, note_bareme: 20 },
      ])
    ).toBe(14)
  })

  it('accepte un barème cible différent', () => {
    expect(moyenneRevisions([{ note: 16, note_bareme: 20 }], 10)).toBe(8)
  })
})

describe('libelleContenuSeance', () => {
  const base = {
    date: '2026-08-17',
    sourate: null,
    versets_de: null,
    versets_a: null,
    contenu_aborde: null,
  }

  it('donne la sourate et ses versets', () => {
    expect(
      libelleContenuSeance({ ...base, sourate: 'Al-Baqara', versets_de: 1, versets_a: 20 })
    ).toBe('Al-Baqara v1–20')
  })

  it('donne la sourate seule quand aucun verset n’est précisé', () => {
    expect(libelleContenuSeance({ ...base, sourate: 'An-Nas' })).toBe('An-Nas')
  })

  it('n’affiche qu’un début de verset quand la fin manque', () => {
    expect(libelleContenuSeance({ ...base, sourate: 'Al-Fatiha', versets_de: 3 })).toBe(
      'Al-Fatiha v3'
    )
  })

  it('ignore un verset de fin sans début : il ne borne rien', () => {
    expect(libelleContenuSeance({ ...base, sourate: 'Al-Fatiha', versets_a: 7 })).toBe(
      'Al-Fatiha'
    )
  })

  it('préfère la sourate au contenu libre', () => {
    expect(
      libelleContenuSeance({ ...base, sourate: 'Yassine', contenu_aborde: 'Révision générale' })
    ).toBe('Yassine')
  })

  it('retombe sur le contenu libre — une séance de tadjwîd n’a pas de sourate', () => {
    expect(
      libelleContenuSeance({ ...base, contenu_aborde: 'Tadjwîd : les règles du noun' })
    ).toBe('Tadjwîd : les règles du noun')
  })

  it('ignore un contenu qui n’est que des espaces', () => {
    expect(libelleContenuSeance({ ...base, contenu_aborde: '   ' })).toBe(
      'Séance du 17/08/2026'
    )
  })

  it('identifie la séance par sa date quand rien n’est renseigné', () => {
    expect(libelleContenuSeance(base)).toBe('Séance du 17/08/2026')
  })
})
