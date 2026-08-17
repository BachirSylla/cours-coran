import { describe, expect, it } from 'vitest'

import { coursPublicSchema } from '@/shared/supabase/coursPublicSchema'

/** Ce que `public.cours_public()` renvoie réellement (migration 0007). */
function payload(extra: Record<string, unknown> = {}) {
  return {
    libelle: 'Coran Ramadan Samedi',
    type_libelle: 'Initiation à la lecture du Coran',
    lien_meet: 'https://meet.google.com/dxq-uubq-ewc',
    date_debut: '2026-07-01',
    date_fin: null,
    statut: 'actif',
    creneaux: [{ jour_semaine: 6, heure_debut: '15:00:00', heure_fin: '17:00:00' }],
    dernier_exercice: 'Réviser la page 72.',
    ...extra,
  }
}

describe('coursPublicSchema', () => {
  it('accepte le payload publié tel quel', () => {
    const resultat = coursPublicSchema.parse(payload())

    expect(resultat.libelle).toBe('Coran Ramadan Samedi')
    expect(resultat.creneaux).toEqual([
      { jour_semaine: 6, heure_debut: '15:00:00', heure_fin: '17:00:00' },
    ])
  })

  /**
   * LE test de confidentialité côté client. La fonction SQL est la première
   * barrière ; celle-ci est la seconde. Même si quelqu'un élargissait un jour
   * `cours_public()`, rien de tout cela n'atteindrait l'interface.
   */
  it('ne laisse passer aucune donnée hors de la liste blanche', () => {
    const hostile = payload({
      owner_id: '11111111-1111-1111-1111-111111111111',
      id: '22222222-2222-2222-2222-222222222222',
      prix_mensuel: 15000,
      devise: 'XOF',
      notes: 'Impayé de juillet',
      observations: 'Élève dissipé',
      apprenants: [{ nom: 'Diallo', prenom: 'Aïcha', contact: '+221770000000' }],
      presences: [{ note: 14.5, note_bareme: 20 }],
    })

    const resultat = coursPublicSchema.parse(hostile)

    expect(Object.keys(resultat).sort()).toEqual([
      'creneaux',
      'date_debut',
      'date_fin',
      'dernier_exercice',
      'libelle',
      'lien_meet',
      'statut',
      'type_libelle',
    ])
    expect(JSON.stringify(resultat)).not.toContain('Diallo')
    expect(JSON.stringify(resultat)).not.toContain('Impayé')
    expect(JSON.stringify(resultat)).not.toContain('15000')
  })

  it('supprime aussi les clés en trop d’un créneau', () => {
    const resultat = coursPublicSchema.parse(
      payload({
        creneaux: [
          {
            jour_semaine: 6,
            heure_debut: '15:00:00',
            heure_fin: '17:00:00',
            owner_id: 'secret',
            cours_id: 'secret',
          },
        ],
      })
    )

    expect(Object.keys(resultat.creneaux[0] ?? {}).sort()).toEqual([
      'heure_debut',
      'heure_fin',
      'jour_semaine',
    ])
  })

  it('ramène les champs facultatifs absents ou nuls à null', () => {
    const resultat = coursPublicSchema.parse({
      libelle: 'Lecture',
      type_libelle: 'Lecture du Coran',
      date_debut: '2026-07-01',
      statut: 'actif',
      creneaux: [],
      // lien_meet, date_fin et dernier_exercice ne sont pas transmis.
    })

    expect(resultat.lien_meet).toBeNull()
    expect(resultat.date_fin).toBeNull()
    expect(resultat.dernier_exercice).toBeNull()
  })

  it('refuse un jour de semaine hors 1..7', () => {
    const resultat = coursPublicSchema.safeParse(
      payload({ creneaux: [{ jour_semaine: 8, heure_debut: '15:00', heure_fin: '17:00' }] })
    )

    expect(resultat.success).toBe(false)
  })

  it('refuse un payload amputé de son libellé', () => {
    const { libelle: _, ...sansLibelle } = payload()

    expect(coursPublicSchema.safeParse(sansLibelle).success).toBe(false)
  })
})
