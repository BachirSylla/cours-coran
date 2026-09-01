import { describe, expect, it } from 'vitest'

import { suiviApprenantSchema } from '@/shared/supabase/suiviSchema'

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

describe('suiviApprenantSchema', () => {
  it('accepte un suivi complet', () => {
    const resultat = suiviApprenantSchema.safeParse(suiviValide)

    expect(resultat.success).toBe(true)
    expect(resultat.data?.apprenant).toBe('Aïcha Diallo')
    expect(resultat.data?.evaluations).toHaveLength(1)
  })

  it('supprime toute clé hors liste blanche — le payload hostile', () => {
    const resultat = suiviApprenantSchema.parse({
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
    const resultat = suiviApprenantSchema.parse({
      ...suiviValide,
      evaluations: [
        {
          ...suiviValide.evaluations[0],
          seance_id: 'abc',
          apprenant_id: 'def',
          observations: "Note interne : la famille n'a pas payé.",
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
    const resultat = suiviApprenantSchema.parse({
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

    expect(suiviApprenantSchema.safeParse(sansAssiduite).success).toBe(false)
  })

  it('échoue sur une note sans barème', () => {
    const resultat = suiviApprenantSchema.safeParse({
      ...suiviValide,
      examen: { note: 15 },
    })

    expect(resultat.success).toBe(false)
  })
})
