import { describe, expect, it } from 'vitest'

import { parcoursApprenantSchema, suiviCoursSchema } from '@/shared/supabase/suiviSchema'

/**
 * Ce schéma est la **deuxième** barrière du suivi apprenant : si la fonction
 * SQL s'élargissait un jour, rien hors liste ne doit atteindre l'écran.
 *
 * Les tests ci-dessous sont donc surtout des tests de *ce qui ne passe pas*.
 */

const suiviValide = {
  apprenant: 'Aïcha Diallo',
  cours_libelle: 'Coran niveau 3',
  type_libelle: 'Mémorisation',
  enseignant: 'Amina Bâ',
  centre_nom: 'Centre Al-Fourqane',
  logo: null,
  statut: 'actif',
  evaluations: [
    {
      date: '2026-01-12',
      contenu: 'Al-Baqara v1–5',
      note: 16,
      bareme: 20,
      commentaire: 'Belle fluidité.',
      etat: 'present',
    },
  ],
  assiduite: { present: 12, retard: 1, absent: 0, excuse: 0, partiel: 0, seances: 13 },
  examen: { note: 15, bareme: 20 },
  exercices: 'Réviser la page 72.',
}

describe('suiviCoursSchema', () => {
  it('accepte un suivi complet', () => {
    const resultat = suiviCoursSchema.safeParse(suiviValide)

    expect(resultat.success).toBe(true)
    expect(resultat.data?.apprenant).toBe('Aïcha Diallo')
    expect(resultat.data?.evaluations).toHaveLength(1)
  })

  it('supprime toute clé hors liste blanche — le payload hostile', () => {
    const resultat = suiviCoursSchema.parse({
      ...suiviValide,
      // Ce qu'une fonction élargie par inadvertance pourrait laisser filer.
      prix_mensuel: 15000,
      cours_id: '3f8a…',
      centre_id: 'c1',
      jeton: 'e0d1…',
      autres_apprenants: ['Omar Ndiaye'],
      lien_meet: 'https://meet.example/abc',
    })

    expect(Object.keys(resultat).sort()).toEqual([
      'apprenant',
      'assiduite',
      'centre_nom',
      'cours_libelle',
      'enseignant',
      'evaluations',
      'examen',
      'exercices',
      'logo',
      'statut',
      'type_libelle',
    ])
    expect(JSON.stringify(resultat)).not.toContain('15000')
    expect(JSON.stringify(resultat)).not.toContain('Omar')
    expect(JSON.stringify(resultat)).not.toContain('meet.example')
  })

  it("nettoie aussi l'intérieur des évaluations", () => {
    const resultat = suiviCoursSchema.parse({
      ...suiviValide,
      evaluations: [
        {
          ...suiviValide.evaluations[0],
          seance_id: 'abc',
          apprenant_id: 'def',
          observations: "Note interne : relancer pour le règlement.",
        },
      ],
    })

    expect(Object.keys(resultat.evaluations[0]!).sort()).toEqual([
      'bareme',
      'commentaire',
      'contenu',
      'date',
      'etat',
      'note',
    ])
    expect(JSON.stringify(resultat)).not.toContain('payé')
  })

  it('rétablit la nullabilité que les types générés perdent', () => {
    const resultat = suiviCoursSchema.parse({
      ...suiviValide,
      enseignant: null,
      logo: null,
      examen: null,
      exercices: null,
      evaluations: [{ ...suiviValide.evaluations[0], contenu: null, commentaire: null }],
    })

    expect(resultat.enseignant).toBeNull()
    expect(resultat.examen).toBeNull()
    expect(resultat.exercices).toBeNull()
    expect(resultat.evaluations[0]!.contenu).toBeNull()
  })

  it("échoue si l'assiduité manque — le compteur n'a pas de valeur par défaut sensée", () => {
    const { assiduite: _assiduite, ...sansAssiduite } = suiviValide

    expect(suiviCoursSchema.safeParse(sansAssiduite).success).toBe(false)
  })

  it('échoue sur une note sans barème', () => {
    const resultat = suiviCoursSchema.safeParse({
      ...suiviValide,
      examen: { note: 15 },
    })

    expect(resultat.success).toBe(false)
  })
})

/*
 * Depuis 0025, la fonction rend PLUSIEURS lignes. Le contrat qui compte est que
 * la liste blanche n'ait pas bougé pour autant : agréger des sessions ajoute des
 * lignes, jamais des colonnes.
 */
describe('parcoursApprenantSchema', () => {
  it('accepte un parcours de plusieurs cours', () => {
    const resultat = parcoursApprenantSchema.safeParse([
      suiviValide,
      { ...suiviValide, cours_libelle: 'Coran niveau 1' },
    ])

    expect(resultat.success).toBe(true)
    expect(resultat.data).toHaveLength(2)
  })

  it("préserve l'ordre rendu par SQL — il porte la chronologie", () => {
    const resultat = parcoursApprenantSchema.parse([
      { ...suiviValide, cours_libelle: 'Coran niveau 1' },
      { ...suiviValide, cours_libelle: 'Coran niveau 2' },
      { ...suiviValide, cours_libelle: 'Coran niveau 3' },
    ])

    expect(resultat.map((bloc) => bloc.cours_libelle)).toEqual([
      'Coran niveau 1',
      'Coran niveau 2',
      'Coran niveau 3',
    ])
  })

  /*
   * Le payload hostile, à l'échelle du parcours : une ligne élargie ne doit pas
   * plus passer qu'un objet seul. C'est le cas qui compte, parce qu'une
   * agrégation invite à ajouter « juste une colonne » pour étiqueter les blocs.
   */
  it('supprime les clés hors liste sur CHAQUE ligne', () => {
    const resultat = parcoursApprenantSchema.parse([
      { ...suiviValide, session_nom: 'Session 17', cours_id: 'secret' },
      { ...suiviValide, centre_id: 'secret', prix_mensuel: 12000 },
    ])

    for (const bloc of resultat) {
      expect(Object.keys(bloc).sort()).toEqual([
        'apprenant',
        'assiduite',
        'centre_nom',
        'cours_libelle',
        'enseignant',
        'evaluations',
        'examen',
        'exercices',
        'logo',
        'statut',
        'type_libelle',
      ])
    }
  })

  it('refuse le parcours entier si une seule ligne est malformée', () => {
    const resultat = parcoursApprenantSchema.safeParse([
      suiviValide,
      { ...suiviValide, assiduite: undefined },
    ])

    expect(resultat.success).toBe(false)
  })

  // Zéro ligne est un tableau valide : c'est le repository qui le lit comme un
  // lien mort, pas le schéma.
  it('accepte un parcours vide', () => {
    expect(parcoursApprenantSchema.safeParse([]).success).toBe(true)
  })
})
