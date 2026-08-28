import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getSupabaseClientPublic } from '@/shared/supabase/client'
import { getParJeton } from '@/shared/supabase/coursPublicRepo'

/**
 * Seul repository du projet à être testé directement, et seul endroit où le
 * client Supabase est mocké : c'est l'unique point d'entrée **non authentifié**
 * de l'application, donc le seul dont le contrat mérite un filet à ce niveau.
 */
vi.mock('@/shared/supabase/client', () => ({ getSupabaseClientPublic: vi.fn() }))

const JETON = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

const maybeSingle = vi.fn()
const rpc = vi.fn(() => ({ maybeSingle }))

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

describe('coursPublicRepo.getParJeton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rpc.mockReturnValue({ maybeSingle })
    vi.mocked(getSupabaseClientPublic).mockReturnValue({ rpc } as never)
  })

  it('appelle la fonction publique avec le jeton, et rien d’autre', () => {
    maybeSingle.mockResolvedValue({ data: payload(), error: null })

    void getParJeton(JETON)

    expect(rpc).toHaveBeenCalledExactlyOnceWith('cours_public', { jeton: JETON })
  })

  it('renvoie le cours validé', async () => {
    maybeSingle.mockResolvedValue({ data: payload(), error: null })

    const cours = await getParJeton(JETON)

    expect(cours?.libelle).toBe('Coran Ramadan Samedi')
    expect(cours?.creneaux).toHaveLength(1)
  })

  it('n’expose aucune donnée sensible que la base aurait renvoyée en trop', async () => {
    maybeSingle.mockResolvedValue({
      data: payload({
        // Les colonnes ajoutées par la migration 0012. `owner_id` restait ici
        // après son renommage, et l'assertion serait devenue vraie *toute
        // seule* — sans jamais échouer si la fonction SQL s'élargissait.
        centre_id: '11111111-1111-1111-1111-111111111111',
        enseignant_id: '33333333-3333-3333-3333-333333333333',
        jeton_partage: '44444444-4444-4444-4444-444444444444',
        prix_mensuel: 15000,
        observations: 'Impayé de juillet',
      }),
      error: null,
    })

    const cours = await getParJeton(JETON)

    expect(cours).not.toHaveProperty('centre_id')
    expect(cours).not.toHaveProperty('enseignant_id')
    // Publier le jeton reviendrait à publier le lien de partage lui-même.
    expect(cours).not.toHaveProperty('jeton_partage')
    expect(cours).not.toHaveProperty('prix_mensuel')
    expect(JSON.stringify(cours)).not.toContain('Impayé')
  })

  it('renvoie null pour un jeton inconnu', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })

    await expect(getParJeton(JETON)).resolves.toBeNull()
  })

  it('renvoie null pour un jeton mal formé, sans distinguer le cas', async () => {
    // Un lien tronqué au copier-coller ne doit pas se distinguer d'un lien
    // révoqué : même réponse, même message côté page.
    maybeSingle.mockResolvedValue({
      data: null,
      error: { code: '22P02', message: 'invalid input syntax for type uuid: "abc"' },
    })

    await expect(getParJeton('abc')).resolves.toBeNull()
  })

  it('ne laisse pas fuiter le message brut de Postgres', async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied for function cours_public' },
    })

    await expect(getParJeton(JETON)).rejects.toThrow("Ce lien n'a pas pu être ouvert.")
  })

  it('refuse une réponse qui ne respecte pas le contrat', async () => {
    maybeSingle.mockResolvedValue({ data: { libelle: 'Sans le reste' }, error: null })

    await expect(getParJeton(JETON)).rejects.toThrow('réponse inattendue')
  })
})
