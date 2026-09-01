import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'

import { useSuiviApprenant } from '@/features/suivi/hooks/useSuiviApprenant'
import { PageSuivi } from '@/features/suivi/PageSuivi'
import type { SuiviApprenant } from '@/shared/supabase/suiviSchema'

vi.mock('@/features/suivi/hooks/useSuiviApprenant', () => ({ useSuiviApprenant: vi.fn() }))

const useSuiviApprenantMock = vi.mocked(useSuiviApprenant)

const JETON = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

function suivi(extra: Partial<SuiviApprenant> = {}): SuiviApprenant {
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
        date: '2026-01-05',
        contenu: 'Al-Fatiha',
        note: 17,
        bareme: 20,
        commentaire: null,
        etat: 'retard',
      },
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

function simuler(etat: Partial<UseQueryResult<SuiviApprenant | null, Error>>) {
  useSuiviApprenantMock.mockReturnValue({
    data: null,
    isPending: false,
    isError: false,
    error: null,
    ...etat,
  } as UseQueryResult<SuiviApprenant | null, Error>)
}

function rendre() {
  return render(
    <MemoryRouter initialEntries={[`/suivi/${JETON}`]}>
      <Routes>
        <Route path="/suivi/:jeton" element={<PageSuivi />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('PageSuivi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("annonce l'apprenant et son cours", () => {
    simuler({ data: suivi() })
    rendre()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Aïcha Diallo')
    expect(screen.getByText(/Coran niveau 3/)).toBeInTheDocument()
    expect(screen.getByText(/Amina Bâ/)).toBeInTheDocument()
  })

  it('affiche les notes réelles avec leur barème et leur contenu', () => {
    simuler({ data: suivi() })
    rendre()

    expect(screen.getByText('17/20')).toBeInTheDocument()
    expect(screen.getByText('16/20')).toBeInTheDocument()
    expect(screen.getByText('Al-Baqara v1–5')).toBeInTheDocument()
    expect(screen.getByText(/Belle fluidité/)).toBeInTheDocument()
  })

  it("mentionne l'état seulement quand il n'est pas « présent »", () => {
    simuler({ data: suivi() })
    rendre()

    expect(screen.getByText(/En retard/)).toBeInTheDocument()
    expect(screen.queryByText(/· Présent/)).not.toBeInTheDocument()
  })

  it('ne calcule ni moyenne ni note finale', () => {
    simuler({ data: suivi() })
    const { container } = rendre()

    expect(container.textContent).not.toMatch(/moyenne/i)
    expect(container.textContent).not.toMatch(/note finale/i)
  })

  it("trace la courbe dès deux notes, jamais avec une seule", () => {
    simuler({ data: suivi() })
    const { unmount } = rendre()

    expect(screen.getByRole('img', { name: /Évolution des notes/ })).toBeInTheDocument()
    unmount()

    simuler({ data: suivi({ evaluations: [suivi().evaluations[0]!] }) })
    rendre()

    expect(screen.queryByRole('img', { name: /Évolution/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Progression')).not.toBeInTheDocument()
  })

  it("compte l'assiduité et dit sur combien de séances tenues", () => {
    simuler({ data: suivi() })
    rendre()

    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('présences')).toBeInTheDocument()
    expect(screen.getByText(/Sur 13 séances tenues/)).toBeInTheDocument()
  })

  it('tait les excusées et les partielles quand il n’y en a aucune', () => {
    simuler({ data: suivi() })
    rendre()

    expect(screen.queryByText(/excusée/)).not.toBeInTheDocument()
    expect(screen.queryByText(/partielle/)).not.toBeInTheDocument()
  })

  it('met les exercices en avant quand il y en a', () => {
    simuler({ data: suivi({ exercices: 'Réviser la page 72.' }) })
    rendre()

    expect(screen.getByText('Réviser la page 72.')).toBeInTheDocument()
    expect(screen.getByText(/À préparer/)).toBeInTheDocument()
  })

  it("n'affiche l'examen que lorsqu'il existe", () => {
    simuler({ data: suivi() })
    const { unmount } = rendre()

    expect(screen.queryByText(/Examen de fin de session/)).not.toBeInTheDocument()
    unmount()

    simuler({ data: suivi({ examen: { note: 15, bareme: 20 } }) })
    rendre()

    expect(screen.getByText(/Examen de fin de session/)).toBeInTheDocument()
    expect(screen.getByText('15/20')).toBeInTheDocument()
  })

  it("dit qu'aucune récitation n'est notée plutôt que d'afficher une grille vide", () => {
    simuler({ data: suivi({ evaluations: [] }) })
    rendre()

    expect(screen.getByText(/Aucune récitation n'a encore été notée/)).toBeInTheDocument()
  })

  it('signale une session terminée sans fermer la page', () => {
    simuler({ data: suivi({ statut: 'termine' }) })
    rendre()

    expect(screen.getByText(/Cette session est terminée/)).toBeInTheDocument()
    // Les résultats sont l'objet même de la page : ils restent lisibles.
    expect(screen.getByText('17/20')).toBeInTheDocument()
  })

  it('rappelle que le lien est personnel', () => {
    simuler({ data: suivi() })
    rendre()

    expect(screen.getByText(/ne pas le transmettre/)).toBeInTheDocument()
  })

  /*
   * Le point de sécurité : révoqué, régénéré, inventé ou tronqué doivent
   * produire le MÊME écran. Un message différent serait un oracle — il dirait
   * qu'un lien a existé, donc qu'un apprenant existe. Le repository ramène ces
   * quatre cas à `data: null`, ce que ce test représente.
   */
  it('donne un seul message neutre pour tous les jetons morts', () => {
    simuler({ data: null })
    rendre()

    expect(screen.getByText(/Ce lien n'est plus valide/)).toBeInTheDocument()
    expect(screen.queryByText(/révoqué|expiré|inconnu|introuvable/i)).not.toBeInTheDocument()
  })

  /*
   * Une PANNE n'est pas un lien mort, et les confondre annonçait « votre lien
   * n'est plus valide » sur une coupure réseau. Ce n'est pas un oracle : une
   * panne survient pareillement sur un jeton valide et sur un jeton révoqué.
   */
  it("distingue une panne d'un lien mort, sans rien dire du jeton", () => {
    simuler({ isError: true, error: new Error('peu importe') })
    rendre()

    expect(screen.getByText(/Affichage momentanément impossible/)).toBeInTheDocument()
    expect(screen.getByText(/Votre lien reste valide/)).toBeInTheDocument()
    expect(screen.queryByText(/n'est plus valide/)).not.toBeInTheDocument()
  })

  it('ne laisse jamais un message technique atteindre la famille', () => {
    simuler({ isError: true, error: new Error('permission denied for table presence') })
    const { container } = rendre()

    expect(container.textContent).not.toContain('permission denied')
  })

  it('demande aux robots de ne pas indexer — le jeton est dans l’URL', () => {
    simuler({ data: suivi() })
    rendre()

    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, nofollow'
    )
  })

  it('patiente sans rien affirmer pendant le chargement', () => {
    simuler({ isPending: true })
    rendre()

    expect(screen.getByRole('status')).toHaveTextContent('Chargement…')
    expect(screen.queryByText(/n'est plus valide/)).not.toBeInTheDocument()
  })
})
