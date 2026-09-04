import { describe, expect, it, vi } from 'vitest'

import {
  comparerParcours,
  type InscriptionAvecCours,
  type SessionDuCours,
} from '@/shared/supabase/inscriptionRepo'

/**
 * L'ordre du parcours d'un apprenant.
 *
 * Ce n'est pas une préférence de présentation : la fiche interne regroupe les
 * cours en réunissant les suites **consécutives**. Une session qui se scinde
 * s'affiche donc deux fois, sous deux en-têtes, avec la même clé React. Le tri
 * est ce qui garantit qu'elle forme un bloc d'un seul tenant.
 */
vi.mock('@/shared/supabase/client', () => ({ getSupabaseClient: vi.fn() }))

function session(id: string, dateDebut: string): SessionDuCours {
  return { id, nom: id, date_debut: dateDebut, date_fin: null, statut: 'en_cours' }
}

function inscription(
  id: string,
  libelle: string,
  laSession: SessionDuCours | null
): InscriptionAvecCours {
  return {
    id,
    centre_id: 'centre-1',
    apprenant_id: 'a1',
    cours_id: `cours-${id}`,
    note_examen: null,
    examen_bareme: null,
    jeton: null,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
    cours: {
      id: `cours-${id}`,
      centre_id: 'centre-1',
      libelle,
      type_cours_id: 'type-1',
      reconduit_de: null,
      format: 'groupe',
      date_debut: '2026-07-01',
      date_fin: null,
      lien_meet: null,
      jeton_partage: null,
      session_id: laSession?.id ?? 'inconnue',
      niveau: null,
      enseignant_id: null,
      logo: null,
      assiduite_active: null,
      base_academique: null,
      bareme_assiduite: null,
      penalite_absence: null,
      penalite_retard: null,
      penaliser_absences_excusees: null,
      statut: 'actif',
      created_at: '2026-07-01T10:00:00Z',
      updated_at: '2026-07-01T10:00:00Z',
      type_cours: { libelle: 'Mémorisation' },
      creneau: [],
      session: laSession,
    },
  }
}

/** Les sessions se suivent-elles chacune d'un seul tenant ? */
function sessionsContinues(ordonne: InscriptionAvecCours[]): boolean {
  const vues = new Set<string>()
  let precedente: string | null = null

  for (const ligne of ordonne) {
    const cle = ligne.cours?.session?.id ?? 'sans-session'
    if (cle === precedente) continue
    if (vues.has(cle)) return false
    vues.add(cle)
    precedente = cle
  }

  return true
}

const S17 = session('s17', '2026-01-05')
const S18 = session('s18', '2026-06-01')
const RATTRAPAGE = session('s-rattrapage', '2026-06-01')

describe('comparerParcours', () => {
  it('met la session la plus récente en tête', () => {
    const ordonne = [
      inscription('i1', 'Alif', S17),
      inscription('i2', 'Alif', S18),
    ].sort(comparerParcours)

    expect(ordonne.map((ligne) => ligne.cours?.session?.id)).toEqual(['s18', 's17'])
  })

  /*
   * ⚠️ LE CAS QUI A CASSÉ. §5.15 autorise deux sessions à la même date de début —
   * « une session de rattrapage n'attend pas la fin de la précédente ». Sans
   * départage par identifiant de session, le tri retombait sur le libellé du
   * cours et entremêlait les deux : Alif(S18) · Mim(rattrapage) · Zoulou(S18).
   */
  it('ne mélange jamais deux sessions de même date de début', () => {
    const ordonne = [
      inscription('i1', 'Alif', S18),
      inscription('i2', 'Mim', RATTRAPAGE),
      inscription('i3', 'Zoulou', S18),
    ].sort(comparerParcours)

    expect(sessionsContinues(ordonne)).toBe(true)
  })

  it('garde les cours d’une session triés entre eux', () => {
    const ordonne = [
      inscription('i1', 'Zoulou', S18),
      inscription('i2', 'Alif', S18),
    ].sort(comparerParcours)

    expect(ordonne.map((ligne) => ligne.cours?.libelle)).toEqual(['Alif', 'Zoulou'])
  })

  /*
   * Deux cours homonymes dans une même session existent — rien ne l'interdit.
   * L'identifiant d'inscription départage en dernier ressort, sans quoi l'ordre
   * varierait d'un chargement à l'autre.
   */
  it('reste total et stable sur deux cours de même libellé', () => {
    const lignes = [inscription('i2', 'Alif', S18), inscription('i1', 'Alif', S18)]

    expect([...lignes].sort(comparerParcours).map((l) => l.id)).toEqual(['i1', 'i2'])
    expect([...lignes].reverse().sort(comparerParcours).map((l) => l.id)).toEqual(['i1', 'i2'])
  })

  it('range en dernier ce dont la session est inconnue, sans planter', () => {
    const ordonne = [
      inscription('i1', 'Sans session', null),
      inscription('i2', 'Alif', S18),
    ].sort(comparerParcours)

    expect(ordonne.map((ligne) => ligne.cours?.libelle)).toEqual(['Alif', 'Sans session'])
  })
})
