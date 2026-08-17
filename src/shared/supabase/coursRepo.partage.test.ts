import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getSupabaseClient } from '@/shared/supabase/client'
import { activerPartage, desactiverPartage, regenererToken } from '@/shared/supabase/coursRepo'

/**
 * Génération et révocation du lien public.
 *
 * L'enjeu vérifié ici est le **routage** : chacune des trois actions doit
 * appeler sa propre fonction SQL. Confondre `activer` et `regenerer` casserait
 * silencieusement tous les liens déjà distribués à chaque ouverture de la fiche.
 */
vi.mock('@/shared/supabase/client', () => ({ getSupabaseClient: vi.fn() }))

const COURS_ID = '9a8b7c6d-5e4f-4a3b-2c1d-0e9f8a7b6c5d'
const JETON = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

const rpc = vi.fn()

describe('coursRepo — partage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc } as never)
  })

  it('active le partage et renvoie le jeton', async () => {
    rpc.mockResolvedValue({ data: JETON, error: null })

    await expect(activerPartage(COURS_ID)).resolves.toBe(JETON)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('activer_partage', { p_cours_id: COURS_ID })
  })

  it('régénère le jeton par une fonction distincte', async () => {
    rpc.mockResolvedValue({ data: JETON, error: null })

    await expect(regenererToken(COURS_ID)).resolves.toBe(JETON)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('regenerer_partage', { p_cours_id: COURS_ID })
  })

  it('désactive le partage', async () => {
    rpc.mockResolvedValue({ data: null, error: null })

    await expect(desactiverPartage(COURS_ID)).resolves.toBeUndefined()
    expect(rpc).toHaveBeenCalledExactlyOnceWith('revoquer_partage', { p_cours_id: COURS_ID })
  })

  it('signale un cours introuvable plutôt que de renvoyer un jeton vide', async () => {
    // Aucune ligne mise à jour : cours supprimé, ou masqué par la RLS.
    rpc.mockResolvedValue({ data: null, error: null })

    await expect(activerPartage(COURS_ID)).rejects.toThrow('cours introuvable')
  })

  it('traduit une erreur de la base en message lisible', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied for table cours' },
    })

    await expect(regenererToken(COURS_ID)).rejects.toThrow(
      'Régénération du lien de partage : accès refusé. Vérifiez que vous êtes bien connecté.'
    )
  })
})
