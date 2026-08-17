import { describe, expect, it } from 'vitest'

import { etatCoursPublic, lienRejoignable } from '@/features/partage/etatCoursPublic'
import type { CoursPublic } from '@/shared/supabase/coursPublicSchema'

/** Lundi 17 août 2026, 9h00. */
const LUNDI_9H = new Date(2026, 7, 17, 9, 0)

function cours(extra: Partial<CoursPublic> = {}): CoursPublic {
  return {
    libelle: 'Mémorisation',
    type_libelle: 'Mémorisation',
    lien_meet: 'https://meet.google.com/abc-defg-hij',
    date_debut: '2026-07-01',
    date_fin: null,
    statut: 'actif',
    creneaux: [{ jour_semaine: 1, heure_debut: '10:00:00', heure_fin: '11:00:00' }],
    dernier_exercice: null,
    ...extra,
  }
}

describe('etatCoursPublic', () => {
  it('annonce la prochaine séance du jour même', () => {
    const etat = etatCoursPublic(cours(), LUNDI_9H)

    expect(etat).toEqual({
      type: 'prochaine',
      occurrence: {
        cours_id: '',
        date: '2026-08-17',
        jour_semaine: 1,
        heure_debut: '10:00:00',
        heure_fin: '11:00:00',
      },
    })
  })

  it('passe à la semaine suivante quand la séance du jour est finie', () => {
    const etat = etatCoursPublic(
      cours({
        creneaux: [{ jour_semaine: 1, heure_debut: '07:00:00', heure_fin: '08:00:00' }],
      }),
      LUNDI_9H
    )

    expect(etat.type).toBe('prochaine')
    expect(etat.type === 'prochaine' && etat.occurrence.date).toBe('2026-08-24')
  })

  it('garde une séance en cours comme prochaine séance', () => {
    // C'est justement le moment où l'apprenant a besoin du lien.
    const etat = etatCoursPublic(
      cours({
        creneaux: [{ jour_semaine: 1, heure_debut: '08:30:00', heure_fin: '09:30:00' }],
      }),
      LUNDI_9H
    )

    expect(etat.type === 'prochaine' && etat.occurrence.date).toBe('2026-08-17')
  })

  it('retient le créneau le plus proche quand il y en a plusieurs', () => {
    const etat = etatCoursPublic(
      cours({
        creneaux: [
          { jour_semaine: 1, heure_debut: '18:00:00', heure_fin: '19:00:00' },
          { jour_semaine: 3, heure_debut: '10:00:00', heure_fin: '11:00:00' },
        ],
      }),
      LUNDI_9H
    )

    expect(etat.type === 'prochaine' && etat.occurrence.date).toBe('2026-08-17')
  })

  it('annonce un cours terminé par son statut', () => {
    expect(etatCoursPublic(cours({ statut: 'termine' }), LUNDI_9H)).toEqual({ type: 'termine' })
  })

  it('annonce un cours terminé par sa date de fin dépassée', () => {
    expect(etatCoursPublic(cours({ date_fin: '2026-08-16' }), LUNDI_9H)).toEqual({
      type: 'termine',
    })
  })

  it('ne considère pas terminé un cours dont la date de fin est aujourd’hui', () => {
    expect(etatCoursPublic(cours({ date_fin: '2026-08-17' }), LUNDI_9H).type).toBe('prochaine')
  })

  it('annonce une pause plutôt qu’une séance qui n’aura pas lieu', () => {
    expect(etatCoursPublic(cours({ statut: 'pause' }), LUNDI_9H)).toEqual({ type: 'pause' })
  })

  it('annonce la date de début d’un cours pas encore commencé', () => {
    expect(etatCoursPublic(cours({ date_debut: '2026-09-01' }), LUNDI_9H)).toEqual({
      type: 'a_venir',
      date: '2026-09-01',
    })
  })

  it('n’invente pas de séance quand le cours n’a aucun créneau', () => {
    expect(etatCoursPublic(cours({ creneaux: [] }), LUNDI_9H)).toEqual({ type: 'aucune' })
  })
})

describe('lienRejoignable', () => {
  it('donne le lien quand une séance est prévue', () => {
    const fiche = cours()

    expect(lienRejoignable(fiche, etatCoursPublic(fiche, LUNDI_9H))).toBe(fiche.lien_meet)
  })

  it('refuse le lien pour un cours en pause, même si la base l’a transmis', () => {
    // Deuxième verrou : la fonction SQL masque déjà le lien dans ce cas.
    const fiche = cours({ statut: 'pause' })

    expect(lienRejoignable(fiche, etatCoursPublic(fiche, LUNDI_9H))).toBeNull()
  })

  it('refuse le lien pour un cours terminé', () => {
    const fiche = cours({ statut: 'termine' })

    expect(lienRejoignable(fiche, etatCoursPublic(fiche, LUNDI_9H))).toBeNull()
  })

  it('renvoie null quand aucun lien n’a été renseigné', () => {
    const fiche = cours({ lien_meet: null })

    expect(lienRejoignable(fiche, etatCoursPublic(fiche, LUNDI_9H))).toBeNull()
  })
})
