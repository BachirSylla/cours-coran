import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useMembre } from '@/features/membres/hooks/useMembre'
import type { LigneMois } from '@/features/paiements/hooks/usePaiementsMois'
import { usePaiementsMois } from '@/features/paiements/hooks/usePaiementsMois'
import { PaiementsPage } from '@/features/paiements/PaiementsPage'
import {
  moisCourant,
  moisPrecedent,
  moisSuivant,
  type StatutPaiement,
} from '@/shared/lib/paiements'

vi.mock('@/features/paiements/hooks/usePaiementsMois', () => ({
  usePaiementsMois: vi.fn(),
}))
// Le dialog monte ses propres requêtes : il n'est pas le sujet de ce test.
vi.mock('@/features/paiements/components/PaiementFormDialog', () => ({
  PaiementFormDialog: ({ cible }: { cible: { cours_libelle: string } | null }) =>
    cible ? <div role="dialog">Règlement {cible.cours_libelle}</div> : null,
}))
vi.mock('@/features/membres/hooks/useMembre', () => ({ useMembre: vi.fn() }))

const useMembreMock = vi.mocked(useMembre)

/**
 * Rôle du compte dans son centre. Par défaut responsable — c'est la situation
 * de l'enseignant solo, qui est aussi responsable de son propre centre : ces
 * tests décrivent alors exactement le comportement d'avant la migration 0012.
 */
function membre(role: 'responsable' | 'enseignant' = 'responsable') {
  return {
    membre: null,
    userId: 'moi',
    centreId: 'centre-1',
    role,
    estResponsable: role === 'responsable',
    chargement: false,
  }
}

const usePaiementsMoisMock = vi.mocked(usePaiementsMois)

function ligne(
  cours_libelle: string,
  statut: StatutPaiement,
  montant_du = 15000,
  montant_recu = 0
): LigneMois {
  return {
    cours_id: `cours-${cours_libelle}`,
    mois: '2026-08',
    montant_du,
    montant_recu,
    statut,
    paiement: null,
    horsPeriode: false,
    cours_libelle,
    devise: 'XOF',
  }
}

function simuler(etat: Partial<ReturnType<typeof usePaiementsMois>>) {
  usePaiementsMoisMock.mockReturnValue({
    lignes: [],
    totaux: { du: 0, recu: 0, reste: 0 },
    parStatut: { paye: 0, partiel: 0, attente: 0, retard: 0 },
    isPending: false,
    isError: false,
    error: null,
    ...etat,
  })
}

function afficher() {
  return render(
    <MemoryRouter>
      <PaiementsPage />
    </MemoryRouter>
  )
}

describe('PaiementsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useMembreMock.mockReturnValue(membre())
  })

  it('affiche un indicateur pendant le chargement', () => {
    simuler({ isPending: true })

    afficher()

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/chargement des paiements/i)).toBeInTheDocument()
  })

  it('affiche l’erreur quand le chargement échoue', () => {
    simuler({ isError: true, error: new Error('Session expirée.') })

    afficher()

    expect(screen.getByText('Chargement impossible')).toBeInTheDocument()
    expect(screen.getByText('Session expirée.')).toBeInTheDocument()
  })

  it('affiche un état vide quand aucun cours n’est facturé', () => {
    simuler({ lignes: [] })

    afficher()

    expect(screen.getByText('Rien à facturer ce mois-ci')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /voir mes cours/i })).toHaveAttribute(
      'href',
      '/cours'
    )
  })

  it('affiche une ligne par cours avec son statut', () => {
    simuler({
      lignes: [
        ligne('Groupe Hifz', 'paye', 15000, 15000),
        ligne('Lecture Aïcha', 'partiel', 15000, 5000),
        ligne('Initiation Ali', 'attente'),
        ligne('Tajweed', 'retard'),
      ],
      totaux: { du: 60000, recu: 20000, reste: 40000 },
    })

    afficher()

    // Chaque cours apparaît deux fois : tableau (≥ md) et carte (mobile).
    expect(screen.getAllByText('Groupe Hifz')).toHaveLength(2)
    expect(screen.getAllByText('Payé')).toHaveLength(2)
    expect(screen.getAllByText('Partiel')).toHaveLength(2)
    expect(screen.getAllByText('En attente')).toHaveLength(2)
    expect(screen.getAllByText('En retard')).toHaveLength(2)
  })

  it('affiche les totaux du mois', () => {
    simuler({
      lignes: [ligne('Groupe Hifz', 'partiel', 15000, 5000)],
      totaux: { du: 15000, recu: 5000, reste: 10000 },
    })

    afficher()

    // Les mêmes montants figurent aussi dans la ligne : on lit la valeur
    // portée par chaque tuile de total, pas n'importe quelle occurrence.
    function valeurDuTotal(libelle: string): string {
      return screen.getByText(libelle).parentElement?.textContent ?? ''
    }

    // Espaces insécables selon la locale : on cherche le groupe de chiffres.
    expect(valeurDuTotal('Attendu')).toMatch(/15\s?000/)
    expect(valeurDuTotal('Encaissé')).toMatch(/5\s?000/)
    expect(valeurDuTotal('Reste dû')).toMatch(/10\s?000/)
  })

  it('n’emploie aucun terme de relance', () => {
    simuler({
      lignes: [ligne('Tajweed', 'retard')],
      totaux: { du: 15000, recu: 0, reste: 15000 },
    })

    afficher()

    for (const mot of [/relanc/i, /impay/i, /rappel/i, /urgent/i]) {
      expect(screen.queryByText(mot)).not.toBeInTheDocument()
    }
  })

  it('ouvre la saisie d’un règlement depuis une ligne', async () => {
    simuler({ lignes: [ligne('Groupe Hifz', 'attente')] })
    const utilisateur = userEvent.setup()

    afficher()

    await utilisateur.click(
      screen.getAllByRole('button', { name: /Enregistrer un règlement pour Groupe Hifz/ })[0]!
    )

    expect(screen.getByRole('dialog')).toHaveTextContent('Règlement Groupe Hifz')
  })

  it('démarre sur le mois courant et navigue d’un mois à l’autre', async () => {
    simuler({ lignes: [] })
    const utilisateur = userEvent.setup()

    afficher()

    expect(usePaiementsMoisMock.mock.calls[0]?.[0]).toBe(moisCourant())
    expect(screen.getByRole('button', { name: /mois courant/i })).toBeDisabled()

    await utilisateur.click(screen.getByRole('button', { name: /mois suivant/i }))
    expect(usePaiementsMoisMock.mock.calls.at(-1)?.[0]).toBe(moisSuivant(moisCourant()))

    await utilisateur.click(screen.getByRole('button', { name: /mois précédent/i }))
    expect(usePaiementsMoisMock.mock.calls.at(-1)?.[0]).toBe(moisCourant())

    await utilisateur.click(screen.getByRole('button', { name: /mois précédent/i }))
    expect(usePaiementsMoisMock.mock.calls.at(-1)?.[0]).toBe(moisPrecedent(moisCourant()))
    expect(screen.getByRole('button', { name: /mois courant/i })).toBeEnabled()
  })

  it('reste fermée à un enseignant, sans laisser croire à une panne', () => {
    // La RLS lui renvoie zéro règlement : sans ce mot, il verrait un tableau de
    // bord vide et conclurait au bug (migration 0012).
    useMembreMock.mockReturnValue(membre('enseignant'))
    simuler({ lignes: [] })

    afficher()

    expect(screen.getByText('Réservé au responsable')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /mois suivant/i })).not.toBeInTheDocument()
  })
})
