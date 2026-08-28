import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getSupabaseClient } from '@/shared/supabase/client'
import * as membreRepo from '@/shared/supabase/membreRepo'
import { BAREME_PAR_DEFAUT, get } from '@/shared/supabase/parametresRepo'

/**
 * Le barème de récitation vient de **deux** endroits depuis la migration 0012 :
 * la ligne `membre` de l'enseignant d'abord, celle du centre ensuite. C'est la
 * seule composition du repository, et la seule chose que ce fichier vérifie.
 */
vi.mock('@/shared/supabase/client', () => ({ getSupabaseClient: vi.fn() }))
vi.mock('@/shared/supabase/membreRepo', () => ({ getCourant: vi.fn() }))

const maybeSingle = vi.fn()

/** Réglages du centre tels que la base les renverrait. */
function ligneCentre(note_bareme: number | null) {
  return {
    note_bareme,
    logo: null,
    assiduite_active: true,
    base_academique: 'moyenne_devoirs_examen',
    bareme_academique: 17,
    bareme_assiduite: 3,
    penalite_absence: 0.5,
    penalite_retard: 0.25,
    penaliser_absences_excusees: false,
  }
}

function membre(note_bareme: number | null) {
  return { note_bareme } as unknown as Awaited<ReturnType<typeof membreRepo.getCourant>>
}

describe('parametresRepo.get — barème de récitation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: () => ({ select: () => ({ maybeSingle }) }),
    } as never)
  })

  it('préfère le barème de l’enseignant', () => {
    maybeSingle.mockResolvedValue({ data: ligneCentre(20), error: null })
    vi.mocked(membreRepo.getCourant).mockResolvedValue(membre(10))

    return expect(get('u1')).resolves.toMatchObject({ note_bareme: 10 })
  })

  it('retombe sur celui du centre quand il n’en a pas choisi', () => {
    // C'est la non-régression : un compte d'avant la migration 0012 n'a pas de
    // barème propre, et doit continuer à noter exactement comme avant.
    maybeSingle.mockResolvedValue({ data: ligneCentre(10), error: null })
    vi.mocked(membreRepo.getCourant).mockResolvedValue(membre(null))

    return expect(get('u1')).resolves.toMatchObject({ note_bareme: 10 })
  })

  it('ne lit pas le membre quand aucun compte n’est fourni', async () => {
    maybeSingle.mockResolvedValue({ data: ligneCentre(10), error: null })

    await expect(get(null)).resolves.toMatchObject({ note_bareme: 10 })
    expect(membreRepo.getCourant).not.toHaveBeenCalled()
  })

  it('sert le barème du membre même sans aucun réglage de centre', async () => {
    // Les réglages du centre sont à persistance paresseuse : la ligne peut ne
    // pas exister du tout. Le choix de l'enseignant doit tenir quand même.
    maybeSingle.mockResolvedValue({ data: null, error: null })
    vi.mocked(membreRepo.getCourant).mockResolvedValue(membre(10))

    const parametres = await get('u1')

    expect(parametres.note_bareme).toBe(10)
    // Le drapeau décrit les réglages du CENTRE, que le barème du membre ne crée pas.
    expect(parametres.enregistres).toBe(false)
  })

  it('retombe sur le défaut quand ni l’un ni l’autre n’a été réglé', () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    vi.mocked(membreRepo.getCourant).mockResolvedValue(membre(null))

    return expect(get('u1')).resolves.toMatchObject({ note_bareme: BAREME_PAR_DEFAUT })
  })
})
