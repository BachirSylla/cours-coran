import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'

import { SectionSuiviApprenant } from '@/features/inscriptions/components/SectionSuiviApprenant'
import { useInscriptionsCours } from '@/features/inscriptions/hooks/useInscriptionsCours'
import {
  useActiverSuivi,
  useRegenererSuivi,
  useRevoquerSuivi,
} from '@/features/suivi/hooks/useLienSuivi'
import type { Apprenant } from '@/shared/supabase/apprenantRepo'
import type { InscriptionAvecApprenant } from '@/shared/supabase/inscriptionRepo'

vi.mock('@/features/inscriptions/hooks/useInscriptionsCours', () => ({
  useInscriptionsCours: vi.fn(),
}))
vi.mock('@/features/suivi/hooks/useLienSuivi', () => ({
  useActiverSuivi: vi.fn(),
  useRegenererSuivi: vi.fn(),
  useRevoquerSuivi: vi.fn(),
}))

const useInscriptionsMock = vi.mocked(useInscriptionsCours)
const useActiverMock = vi.mocked(useActiverSuivi)
const useRegenererMock = vi.mocked(useRegenererSuivi)
const useRevoquerMock = vi.mocked(useRevoquerSuivi)

const activer = vi.fn()
const regenerer = vi.fn()
const revoquer = vi.fn()

const JETON = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

function apprenant(id: string, prenom: string, nom: string): Apprenant {
  return {
    id,
    centre_id: 'centre-1',
    nom,
    prenom,
    contact: null,
    niveau: null,
    date_inscription: '2026-07-01',
    statut: 'actif',
    notes: null,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
  }
}

const AICHA = apprenant('a1', 'Aïcha', 'Diallo')
const OMAR = apprenant('a2', 'Omar', 'Ndiaye')

function inscription(
  id: string,
  personne: Apprenant,
  jeton: string | null = null
): InscriptionAvecApprenant {
  return {
    id,
    centre_id: 'centre-1',
    apprenant_id: personne.id,
    cours_id: 'cours-1',
    note_examen: null,
    examen_bareme: null,
    jeton,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
    apprenant: personne,
  }
}

function requete<T>(donnees: T, isPending = false) {
  return { data: donnees, isPending, isError: false, error: null } as UseQueryResult<T, Error>
}

function mutation(mutate: ReturnType<typeof vi.fn>, extra: Record<string, unknown> = {}) {
  return {
    mutate,
    isPending: false,
    isError: false,
    error: null,
    ...extra,
  } as unknown as ReturnType<typeof useActiverSuivi>
}

function rendre() {
  return render(<SectionSuiviApprenant coursId="cours-1" libelle="Coran niveau 3" />)
}

/** La ligne d'un apprenant donné, pour ne pas confondre deux jeux de boutons. */
function ligne(nom: string): HTMLElement {
  const cellule = screen.getByText(nom)
  const element = cellule.closest('li')

  if (!element) throw new Error(`Ligne introuvable pour ${nom}`)

  return element
}

describe('SectionSuiviApprenant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useInscriptionsMock.mockReturnValue(
      requete([inscription('i1', AICHA), inscription('i2', OMAR, JETON)])
    )
    useActiverMock.mockReturnValue(mutation(activer))
    useRegenererMock.mockReturnValue(
      mutation(regenerer) as unknown as ReturnType<typeof useRegenererSuivi>
    )
    useRevoquerMock.mockReturnValue(
      mutation(revoquer) as unknown as ReturnType<typeof useRevoquerSuivi>
    )
  })

  it('affiche une ligne par apprenant inscrit', () => {
    rendre()

    expect(screen.getByText('Aïcha Diallo')).toBeInTheDocument()
    expect(screen.getByText('Omar Ndiaye')).toBeInTheDocument()
  })

  it('dit précisément ce que le lien publie — et ce qu’il ne publie pas', () => {
    rendre()

    expect(screen.getByText(/cet apprenant seulement/)).toBeInTheDocument()
    expect(screen.getByText(/paiements n'y figurent/)).toBeInTheDocument()
  })

  /*
   * Ouvrir un suivi **publie le passé** : tous les commentaires de récitation
   * déjà écrits, sous un régime où seul le centre les lisait. Le geste est
   * global — ni fenêtre, ni « à partir de telle date » — donc il se confirme,
   * et la confirmation doit le DIRE.
   */
  it("ne publie l'historique qu'après une confirmation qui l'annonce", async () => {
    const utilisateur = userEvent.setup()
    rendre()

    await utilisateur.click(within(ligne('Aïcha Diallo')).getByRole('button', { name: /Ouvrir/ }))
    expect(activer).not.toHaveBeenCalled()

    expect(screen.getByText(/notes de récitation déjà saisies/)).toBeInTheDocument()
    expect(screen.getByText(/écrits avant aujourd'hui/)).toBeInTheDocument()

    await utilisateur.click(screen.getByRole('button', { name: 'Confirmer' }))

    expect(activer).toHaveBeenCalledWith({
      inscriptionId: 'i1',
      apprenantId: 'a1',
      coursId: 'cours-1',
    })
  })

  it("renonce à ouvrir le suivi sur Annuler", async () => {
    const utilisateur = userEvent.setup()
    rendre()

    await utilisateur.click(within(ligne('Aïcha Diallo')).getByRole('button', { name: /Ouvrir/ }))
    await utilisateur.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(activer).not.toHaveBeenCalled()
  })

  it('annonce que rien du futur ne sera publié', () => {
    rendre()

    expect(screen.getByText(/rien\s+n'est publié avant d'avoir eu lieu/)).toBeInTheDocument()
  })

  it('montre le lien une fois le suivi ouvert, et plus le bouton d’ouverture', () => {
    rendre()
    const ligneOmar = ligne('Omar Ndiaye')

    expect(within(ligneOmar).getByLabelText(/Lien de suivi de Omar Ndiaye/)).toHaveValue(
      `http://localhost:3000/suivi/${JETON}`
    )
    expect(within(ligneOmar).queryByRole('button', { name: /Ouvrir/ })).not.toBeInTheDocument()
  })

  it('ne montre aucun lien tant que le suivi n’est pas ouvert', () => {
    rendre()

    expect(
      within(ligne('Aïcha Diallo')).queryByLabelText(/Lien de suivi/)
    ).not.toBeInTheDocument()
  })

  it('nomme l’apprenant dans le partage WhatsApp', () => {
    rendre()

    const lien = within(ligne('Omar Ndiaye')).getByRole('link', { name: /WhatsApp/ })

    expect(decodeURIComponent(lien.getAttribute('href') ?? '')).toContain('Omar Ndiaye')
  })

  /*
   * Régénérer et fermer cassent un lien déjà distribué : les deux passent par
   * une confirmation, et ne doivent rien déclencher tant qu'elle n'est pas
   * donnée.
   */
  it('ne régénère qu’après confirmation', async () => {
    const utilisateur = userEvent.setup()
    rendre()

    await utilisateur.click(
      within(ligne('Omar Ndiaye')).getByRole('button', { name: /Régénérer/ })
    )
    expect(regenerer).not.toHaveBeenCalled()

    await utilisateur.click(screen.getByRole('button', { name: 'Confirmer' }))

    expect(regenerer).toHaveBeenCalledWith({
      inscriptionId: 'i2',
      apprenantId: 'a2',
      coursId: 'cours-1',
    })
  })

  it('ne ferme le suivi qu’après confirmation, et renonce sur Annuler', async () => {
    const utilisateur = userEvent.setup()
    rendre()

    await utilisateur.click(within(ligne('Omar Ndiaye')).getByRole('button', { name: /Fermer/ }))
    await utilisateur.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(revoquer).not.toHaveBeenCalled()

    await utilisateur.click(within(ligne('Omar Ndiaye')).getByRole('button', { name: /Fermer/ }))
    await utilisateur.click(screen.getByRole('button', { name: 'Confirmer' }))

    expect(revoquer).toHaveBeenCalledWith({
      inscriptionId: 'i2',
      apprenantId: 'a2',
      coursId: 'cours-1',
    })
  })

  it('remonte le refus de la base sans le maquiller', () => {
    useActiverMock.mockReturnValue(
      mutation(activer, {
        isError: true,
        error: new Error("Seul l'enseignant de ce cours peut ouvrir un suivi."),
      })
    )
    rendre()

    expect(
      screen.getAllByText(/Seul l'enseignant de ce cours peut ouvrir un suivi\./).length
    ).toBeGreaterThan(0)
  })

  it('reste lisible sans aucun inscrit', () => {
    useInscriptionsMock.mockReturnValue(requete<InscriptionAvecApprenant[]>([]))
    rendre()

    expect(screen.getByText(/Aucun apprenant inscrit/)).toBeInTheDocument()
  })
})
