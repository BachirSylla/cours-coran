import { describe, expect, it } from 'vitest'

import { NOTATION_PAR_DEFAUT } from '@/shared/lib/rapport'
import {
  construireRapport,
  decouperEnBlocs,
  niveauNoteFinale,
  type EntreesRapport,
  type InscritRapport,
  type PresenceRapport,
  type SeanceRapport,
} from '@/shared/lib/rapportSession'

function seance(
  id: string,
  date: string,
  presence: PresenceRapport[] = [],
  extra: Partial<SeanceRapport> = {}
): SeanceRapport {
  return {
    id,
    date,
    statut: 'faite',
    sourate: null,
    versets_de: null,
    versets_a: null,
    contenu_aborde: null,
    presence,
    ...extra,
  }
}

function presence(apprenant_id: string, extra: Partial<PresenceRapport> = {}): PresenceRapport {
  return {
    apprenant_id,
    etat: 'present',
    present: true,
    note: null,
    note_bareme: null,
    ...extra,
  }
}

function inscrit(
  apprenant_id: string,
  prenom: string,
  nom: string,
  extra: Partial<InscritRapport> = {}
): InscritRapport {
  return { apprenant_id, prenom, nom, note_examen: null, examen_bareme: null, ...extra }
}

function entrees(extra: Partial<EntreesRapport> = {}): EntreesRapport {
  return {
    seances: [],
    inscrits: [],
    config: NOTATION_PAR_DEFAUT,
    periode: { debut: null, fin: null },
    ...extra,
  }
}

const AICHA = inscrit('a1', 'Aïcha', 'Diallo')
const MOUSSA = inscrit('a2', 'Moussa', 'Camara')

describe('construireRapport — colonnes', () => {
  it('ne retient que les séances réellement tenues', () => {
    // Le piège du lot A : pénaliser quelqu'un pour une séance annulée par
    // l'enseignant serait un contresens.
    const rapport = construireRapport(
      entrees({
        seances: [
          seance('s1', '2026-03-15'),
          seance('s2', '2026-03-22', [], { statut: 'annulee' }),
          seance('s3', '2026-03-29', [], { statut: 'reportee' }),
          seance('s4', '2026-04-05'),
        ],
      })
    )

    expect(rapport.colonnesPresence.map((colonne) => colonne.seance_id)).toEqual(['s1', 's4'])
    expect(rapport.synthese.nbSeances).toBe(2)
  })

  it('trie les colonnes par date', () => {
    const rapport = construireRapport(
      entrees({
        seances: [seance('s2', '2026-04-05'), seance('s1', '2026-03-15')],
      })
    )

    expect(rapport.colonnesPresence.map((colonne) => colonne.date)).toEqual([
      '2026-03-15',
      '2026-04-05',
    ])
  })

  it('applique la période, bornes incluses', () => {
    const seances = [
      seance('s1', '2026-03-01'),
      seance('s2', '2026-03-15'),
      seance('s3', '2026-04-01'),
    ]

    const rapport = construireRapport(
      entrees({ seances, periode: { debut: '2026-03-15', fin: '2026-04-01' } })
    )

    expect(rapport.colonnesPresence.map((colonne) => colonne.seance_id)).toEqual(['s2', 's3'])
  })

  it('sans période, prend tout le cours', () => {
    const rapport = construireRapport(
      entrees({ seances: [seance('s1', '2026-03-01'), seance('s2', '2026-04-01')] })
    )

    expect(rapport.colonnesPresence).toHaveLength(2)
    expect(rapport.periode).toEqual({ debut: '2026-03-01', fin: '2026-04-01' })
  })

  it('titre les colonnes de notes par le contenu travaillé', () => {
    const rapport = construireRapport(
      entrees({
        seances: [
          seance('s1', '2026-03-15', [presence('a1', { note: 8, note_bareme: 10 })], {
            sourate: 'Aṭ-Ṭûr',
            versets_de: 1,
            versets_a: 14,
          }),
          seance('s2', '2026-03-22', [presence('a1', { note: 7, note_bareme: 10 })], {
            contenu_aborde: 'Tadjwîd : les règles du noun',
          }),
        ],
        inscrits: [AICHA],
      })
    )

    expect(rapport.colonnesNotes.map((colonne) => colonne.libelle)).toEqual([
      'Aṭ-Ṭûr v1–14',
      'Tadjwîd : les règles du noun',
    ])
  })

  it('n’ouvre une colonne de notes que si quelqu’un a été noté', () => {
    // Sinon la grille serait à moitié faite de tirets.
    const rapport = construireRapport(
      entrees({
        seances: [
          seance('s1', '2026-03-15', [presence('a1', { note: 8, note_bareme: 10 })]),
          seance('s2', '2026-03-22', [presence('a1')]),
          seance('s3', '2026-03-29', []),
        ],
        inscrits: [AICHA],
      })
    )

    expect(rapport.colonnesPresence).toHaveLength(3)
    expect(rapport.colonnesNotes.map((colonne) => colonne.seance_id)).toEqual(['s1'])
  })
})

describe('construireRapport — ligne d’un apprenant', () => {
  const seances = [
    seance('s1', '2026-03-01', [presence('a1', { etat: 'present' })]),
    seance('s2', '2026-03-08', [presence('a1', { etat: 'absent', present: false })]),
    seance('s3', '2026-03-15', [presence('a1', { etat: 'retard' })]),
    seance('s4', '2026-03-22', [presence('a1', { etat: 'excuse', present: false })]),
  ]

  it('compte les états et calcule le taux de présence', () => {
    const rapport = construireRapport(entrees({ seances, inscrits: [AICHA] }))
    const ligne = rapport.lignes[0]!

    expect(ligne.comptage).toMatchObject({
      presences: 2,
      absences: 2,
      retards: 1,
      excusees: 1,
      total: 4,
    })
    expect(ligne.pourcentagePresence).toBe(50)
  })

  it('calcule l’assiduité — l’absence excusée ne pénalise pas par défaut', () => {
    const rapport = construireRapport(entrees({ seances, inscrits: [AICHA] }))

    // 1 absence sèche × 0,5 + 1 retard × 0,25 = 0,75 retiré de 3.
    expect(rapport.lignes[0]!.assiduite).toBe(2.25)
  })

  it('considère présent un apprenant jamais pointé', () => {
    // Absent de la table = présent par défaut, comme la colonne en base.
    const rapport = construireRapport(
      entrees({ seances: [seance('s1', '2026-03-01')], inscrits: [AICHA] })
    )

    expect(rapport.lignes[0]!.etats['s1']).toBe('present')
    expect(rapport.lignes[0]!.comptage.presences).toBe(1)
  })

  it('retombe sur le booléen pour une ligne d’avant la migration', () => {
    const rapport = construireRapport(
      entrees({
        seances: [seance('s1', '2026-03-01', [presence('a1', { etat: null, present: false })])],
        inscrits: [AICHA],
      })
    )

    expect(rapport.lignes[0]!.etats['s1']).toBe('absent')
  })

  it('moyenne les révisions en passant par le pourcentage', () => {
    const rapport = construireRapport(
      entrees({
        seances: [
          seance('s1', '2026-03-01', [presence('a1', { note: 8, note_bareme: 10 })]),
          seance('s2', '2026-03-08', [presence('a1', { note: 12, note_bareme: 20 })]),
        ],
        inscrits: [AICHA],
      })
    )

    // 80 % et 60 % → 70 %, soit 14/20. Une moyenne brute aurait donné 10.
    expect(rapport.lignes[0]!.nbNotes).toBe(2)
    expect(rapport.lignes[0]!.moyenneRevisions).toBe(14)
  })

  it('compose la note finale à partir de l’examen et de l’assiduité', () => {
    const rapport = construireRapport(
      entrees({
        seances: [seance('s1', '2026-03-01', [presence('a1')])],
        inscrits: [inscrit('a1', 'Aïcha', 'Diallo', { note_examen: 16, examen_bareme: 20 })],
      })
    )
    const ligne = rapport.lignes[0]!

    expect(ligne.academique).toBe(13.6)
    expect(ligne.assiduite).toBe(3)
    expect(ligne.finale).toBe(16.6)
  })

  it('laisse la note finale nulle sans examen', () => {
    const rapport = construireRapport(
      entrees({ seances: [seance('s1', '2026-03-01')], inscrits: [AICHA] })
    )

    expect(rapport.lignes[0]!.examen).toBeNull()
    expect(rapport.lignes[0]!.academique).toBeNull()
    expect(rapport.lignes[0]!.finale).toBeNull()
  })

  it('trie les apprenants par nom puis prénom', () => {
    const rapport = construireRapport(entrees({ inscrits: [AICHA, MOUSSA] }))

    expect(rapport.lignes.map((ligne) => ligne.nom)).toEqual(['Camara', 'Diallo'])
  })
})

describe('construireRapport — synthèse de classe', () => {
  const notes = (note: number) => ({ note_examen: note, examen_bareme: 20 })

  it('ignore les apprenants sans examen dans la moyenne', () => {
    // Les compter comme des zéros effondrerait la moyenne de la classe.
    const rapport = construireRapport(
      entrees({
        seances: [seance('s1', '2026-03-01')],
        inscrits: [
          inscrit('a1', 'Aïcha', 'Diallo', notes(20)),
          inscrit('a2', 'Moussa', 'Camara'),
        ],
      })
    )

    expect(rapport.synthese.moyenneFinale).toBe(20)
    expect(rapport.synthese.meilleureNote).toBe(20)
  })

  it('moyenne les notes finales existantes', () => {
    const rapport = construireRapport(
      entrees({
        seances: [seance('s1', '2026-03-01')],
        inscrits: [
          inscrit('a1', 'Aïcha', 'Diallo', notes(20)),
          inscrit('a2', 'Moussa', 'Camara', notes(10)),
        ],
      })
    )

    // 20/20 → 17 + 3 = 20 ; 10/20 → 8,5 + 3 = 11,5. Moyenne : 15,75.
    expect(rapport.synthese.moyenneFinale).toBe(15.75)
    expect(rapport.synthese.meilleureNote).toBe(20)
  })

  it('moyenne la présence de la classe', () => {
    const rapport = construireRapport(
      entrees({
        seances: [
          seance('s1', '2026-03-01', [presence('a2', { etat: 'absent', present: false })]),
          seance('s2', '2026-03-08'),
        ],
        inscrits: [AICHA, MOUSSA],
      })
    )

    // Aïcha 100 %, Moussa 50 % → 75 %.
    expect(rapport.synthese.presenceMoyenne).toBe(75)
  })

  it('ne renvoie pas NaN sur un cours vide', () => {
    const rapport = construireRapport(entrees())

    expect(rapport.synthese).toEqual({
      moyenneFinale: null,
      presenceMoyenne: null,
      meilleureNote: null,
      nbSeances: 0,
      nbApprenants: 0,
    })
    expect(rapport.periode).toBeNull()
  })
})

describe('construireRapport — barème d’examen', () => {
  it('expose le barème commun quand tous les examens le partagent', () => {
    const rapport = construireRapport(
      entrees({
        inscrits: [
          inscrit('a1', 'Aïcha', 'Diallo', { note_examen: 8, examen_bareme: 10 }),
          inscrit('a2', 'Moussa', 'Camara', { note_examen: 9, examen_bareme: 10 }),
        ],
      })
    )

    expect(rapport.baremeExamenCommun).toBe(10)
  })

  it('n’en expose aucun quand les barèmes diffèrent', () => {
    // L'en-tête ne peut alors pas annoncer « /20 » : chaque note portera le sien.
    const rapport = construireRapport(
      entrees({
        inscrits: [
          inscrit('a1', 'Aïcha', 'Diallo', { note_examen: 8, examen_bareme: 10 }),
          inscrit('a2', 'Moussa', 'Camara', { note_examen: 16, examen_bareme: 20 }),
        ],
      })
    )

    expect(rapport.baremeExamenCommun).toBeNull()
  })

  it('n’en expose aucun quand personne n’a été examiné', () => {
    expect(construireRapport(entrees({ inscrits: [AICHA] })).baremeExamenCommun).toBeNull()
  })
})

describe('niveauNoteFinale', () => {
  it('classe selon les seuils de la maquette', () => {
    expect(niveauNoteFinale(16.35)).toBe('bon')
    expect(niveauNoteFinale(16)).toBe('bon')
    expect(niveauNoteFinale(14.99)).toBe('moyen')
    expect(niveauNoteFinale(10)).toBe('moyen')
    expect(niveauNoteFinale(9.99)).toBe('faible')
  })

  it('ne classe pas une note absente', () => {
    expect(niveauNoteFinale(null)).toBeNull()
  })
})

describe('decouperEnBlocs', () => {
  it('découpe en blocs de taille égale', () => {
    expect(decouperEnBlocs([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ])
  })

  it('laisse un reste partiel dans le dernier bloc', () => {
    expect(decouperEnBlocs([1, 2, 3], 2)).toEqual([[1, 2], [3]])
  })

  it('ne découpe pas une liste plus courte que la taille', () => {
    expect(decouperEnBlocs([1, 2], 20)).toEqual([[1, 2]])
  })

  it('renvoie une liste vide pour une entrée vide', () => {
    expect(decouperEnBlocs([], 20)).toEqual([])
  })

  it('refuse une taille absurde plutôt que de boucler sans fin', () => {
    expect(() => decouperEnBlocs([1], 0)).toThrow('Taille de bloc invalide')
    expect(() => decouperEnBlocs([1], 1.5)).toThrow('Taille de bloc invalide')
  })
})
