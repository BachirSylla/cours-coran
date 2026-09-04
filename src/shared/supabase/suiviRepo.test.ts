import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getSupabaseClientPublic } from '@/shared/supabase/client'
import { getParJeton } from '@/shared/supabase/suiviRepo'

/**
 * Le **second** point d'entrée non authentifié de l'application, et le seul à
 * publier des notes nominatives. Comme `coursPublicRepo`, il mérite un filet à ce
 * niveau : le client Supabase est mocké, et on éprouve le contrat de la couche,
 * pas celui de la base.
 *
 * Ce que 0025 change ici, et qu'il faut ancrer :
 *
 *   * plus de `.maybeSingle()` — la fonction rend une LISTE, et `maybeSingle()`
 *     lèverait dès le deuxième cours, c'est-à-dire pour tout apprenant qui en a
 *     suivi plus d'un. La régression serait invisible au premier essai ;
 *   * une liste VIDE se lit comme un lien mort, exactement comme avant ;
 *   * jeton mal formé et jeton inconnu donnent la même réponse — pas d'oracle ;
 *   * une panne reste une panne, et ne se déguise pas en lien mort.
 */
vi.mock('@/shared/supabase/client', () => ({ getSupabaseClientPublic: vi.fn() }))

const JETON = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

const rpc = vi.fn()

function bloc(extra: Record<string, unknown> = {}) {
  return {
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
    examen: null,
    exercices: null,
    ...extra,
  }
}

describe('suiviRepo.getParJeton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getSupabaseClientPublic).mockReturnValue({ rpc } as never)
  })

  it('appelle la fonction avec le jeton, et rien d’autre', async () => {
    rpc.mockResolvedValue({ data: [bloc()], error: null })

    await getParJeton(JETON)

    expect(rpc).toHaveBeenCalledExactlyOnceWith('suivi_apprenant', { p_jeton: JETON })
  })

  /*
   * ⚠️ LA RÉGRESSION À NE PAS REFAIRE. Avec `.maybeSingle()`, cet appel lèverait
   * PGRST116 — et seulement pour les apprenants qui suivent plus d'un cours.
   */
  it('rend TOUS les blocs du parcours, dans l’ordre reçu', async () => {
    rpc.mockResolvedValue({
      data: [
        bloc({ cours_libelle: 'Coran niveau 1' }),
        bloc({ cours_libelle: 'Coran niveau 2' }),
        bloc({ cours_libelle: 'Coran niveau 3' }),
      ],
      error: null,
    })

    const parcours = await getParJeton(JETON)

    expect(parcours?.map((unBloc) => unBloc.cours_libelle)).toEqual([
      'Coran niveau 1',
      'Coran niveau 2',
      'Coran niveau 3',
    ])
  })

  it('supprime toute clé hors liste blanche avant de rendre la main', async () => {
    rpc.mockResolvedValue({
      data: [bloc({ cours_id: 'secret', prix_mensuel: 12000, session_nom: 'Session 17' })],
      error: null,
    })

    const parcours = await getParJeton(JETON)

    expect(parcours).toHaveLength(1)
    expect(Object.keys(parcours![0]!)).not.toContain('cours_id')
    expect(Object.keys(parcours![0]!)).not.toContain('prix_mensuel')
    expect(Object.keys(parcours![0]!)).not.toContain('session_nom')
  })

  /*
   * Révoqué, inconnu, périmé : la base rend zéro ligne dans les trois cas. Les
   * ramener à `null` ici est ce qui garde la page sur un seul message neutre.
   */
  it('lit une liste vide comme un lien mort', async () => {
    rpc.mockResolvedValue({ data: [], error: null })

    await expect(getParJeton(JETON)).resolves.toBeNull()
  })

  it('lit une réponse absente comme un lien mort', async () => {
    rpc.mockResolvedValue({ data: null, error: null })

    await expect(getParJeton(JETON)).resolves.toBeNull()
  })

  /*
   * Un jeton tronqué au copier-coller n'est pas un incident : Postgres refuse la
   * conversion en `uuid` (22P02). Même réponse qu'un jeton inconnu — sans quoi la
   * différence dirait qu'une adresse bien formée a existé.
   */
  it('donne la même réponse à un jeton mal formé qu’à un jeton inconnu', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '22P02', message: 'invalid input' } })
    const malForme = await getParJeton('pas-un-uuid')

    rpc.mockResolvedValue({ data: [], error: null })
    const inconnu = await getParJeton(JETON)

    expect(malForme).toBeNull()
    expect(inconnu).toBeNull()
  })

  /*
   * Une PANNE n'est pas un lien mort. La distinguer n'ouvre aucun oracle : elle
   * ne dépend pas du jeton, et survient pareillement sur un lien valide et sur un
   * lien révoqué. Les confondre annonçait « votre lien n'est plus valide » sur
   * une coupure réseau.
   */
  it('lève sur une panne, sans laisser passer le message technique', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied for table presence' },
    })

    await expect(getParJeton(JETON)).rejects.toThrow("Ce lien n'a pas pu être ouvert.")
    await expect(getParJeton(JETON)).rejects.not.toThrow(/permission denied/)
  })

  it('lève plutôt que de rendre une réponse qui ne respecte pas le contrat', async () => {
    rpc.mockResolvedValue({ data: [{ apprenant: 'Aïcha' }], error: null })

    await expect(getParJeton(JETON)).rejects.toThrow('réponse inattendue')
  })

  /*
   * Une seule ligne malformée condamne l'appel entier : rendre les autres
   * publierait un parcours amputé sans que personne le sache.
   */
  it('refuse le parcours entier si une seule ligne est malformée', async () => {
    rpc.mockResolvedValue({ data: [bloc(), { apprenant: 'Aïcha' }], error: null })

    await expect(getParJeton(JETON)).rejects.toThrow('réponse inattendue')
  })
})
