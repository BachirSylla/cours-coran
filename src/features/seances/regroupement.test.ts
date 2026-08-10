import { describe, expect, it } from 'vitest'

import {
  grouperParJour,
  libelleStatutSeance,
  type SeanceVueEnrichie,
} from '@/features/seances/regroupement'
import type { JourSemaine } from '@/shared/lib/conflits'
import type { Seance } from '@/shared/supabase/seanceRepo'

function seanceEnregistree(statut: string, date = '2026-07-27'): Seance {
  return {
    id: `s-${date}-${statut}`,
    owner_id: 'proprietaire',
    cours_id: 'cours-1',
    date,
    heure_debut: '10:00:00',
    heure_fin: '11:00:00',
    statut,
    contenu_aborde: null,
    sourate: null,
    sourate_numero: null,
    versets_de: null,
    versets_a: null,
    type_travail: null,
    exercices_a_faire: null,
    observations: null,
    created_at: '2026-07-27T10:00:00Z',
    updated_at: '2026-07-27T10:00:00Z',
  }
}

function vue(
  date: string,
  heure_debut: string,
  options: Partial<SeanceVueEnrichie> = {}
): SeanceVueEnrichie {
  return {
    cours_id: 'cours-1',
    date,
    jour_semaine: 1 as JourSemaine,
    heure_debut,
    heure_fin: '11:00:00',
    seance: null,
    saisie: false,
    orpheline: false,
    cours_libelle: 'Groupe Hifz',
    type_libelle: 'Mémorisation',
    format: 'groupe',
    ...options,
  }
}

describe('grouperParJour', () => {
  it('regroupe les vues d’une même journée', () => {
    const groupes = grouperParJour([
      vue('2026-07-27', '10:00:00'),
      vue('2026-07-27', '15:00:00'),
      vue('2026-07-29', '09:00:00', { jour_semaine: 3 }),
    ])

    expect(groupes).toHaveLength(2)
    expect(groupes[0]?.date).toBe('2026-07-27')
    expect(groupes[0]?.vues).toHaveLength(2)
    expect(groupes[1]?.vues).toHaveLength(1)
  })

  it('trie les groupes par date croissante', () => {
    const groupes = grouperParJour([
      vue('2026-07-31', '10:00:00', { jour_semaine: 5 }),
      vue('2026-07-27', '10:00:00'),
      vue('2026-07-29', '10:00:00', { jour_semaine: 3 }),
    ])

    expect(groupes.map((g) => g.date)).toEqual(['2026-07-27', '2026-07-29', '2026-07-31'])
  })

  it('conserve l’ordre des vues à l’intérieur d’une journée', () => {
    const groupes = grouperParJour([
      vue('2026-07-27', '08:00:00'),
      vue('2026-07-27', '14:00:00'),
    ])

    expect(groupes[0]?.vues.map((v) => v.heure_debut)).toEqual(['08:00:00', '14:00:00'])
  })

  it('déduit le jour d’une vue orpheline depuis sa date', () => {
    // 2026-07-30 est un jeudi (ISO 4) ; l'orpheline n'a pas de jour_semaine.
    const groupes = grouperParJour([
      vue('2026-07-30', '10:00:00', {
        jour_semaine: null,
        orpheline: true,
        saisie: true,
        seance: seanceEnregistree('faite', '2026-07-30'),
      }),
    ])

    expect(groupes[0]?.jour_semaine).toBe(4)
  })

  it('ne produit aucun groupe pour une liste vide', () => {
    expect(grouperParJour([])).toEqual([])
  })
})

describe('libelleStatutSeance', () => {
  it('annonce « À saisir » pour une occurrence vierge', () => {
    expect(libelleStatutSeance(vue('2026-07-27', '10:00:00'))).toBe('À saisir')
  })

  it('reprend le statut d’une séance enregistrée', () => {
    const cas = [
      ['faite', 'Faite'],
      ['annulee', 'Annulée'],
      ['reportee', 'Reportée'],
      ['absence', 'Absence'],
    ] as const

    for (const [statut, attendu] of cas) {
      const ligne = vue('2026-07-27', '10:00:00', {
        saisie: true,
        seance: seanceEnregistree(statut),
      })
      expect(libelleStatutSeance(ligne)).toBe(attendu)
    }
  })

  it('signale une séance hors planning', () => {
    const ligne = vue('2026-07-28', '14:00:00', {
      jour_semaine: null,
      orpheline: true,
      saisie: true,
      seance: seanceEnregistree('faite', '2026-07-28'),
    })

    expect(libelleStatutSeance(ligne)).toBe('Hors planning')
  })

  it('retombe sur la valeur brute pour un statut inconnu', () => {
    const ligne = vue('2026-07-27', '10:00:00', {
      saisie: true,
      seance: seanceEnregistree('inedit'),
    })

    expect(libelleStatutSeance(ligne)).toBe('inedit')
  })
})
