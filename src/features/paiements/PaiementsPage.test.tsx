import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useMembre } from '@/features/membres/hooks/useMembre'
import type { LigneFacturation } from '@/features/paiements/hooks/useReglements'
import { useReglements } from '@/features/paiements/hooks/useReglements'
import { PaiementsPage } from '@/features/paiements/PaiementsPage'
import {
  moisCourant,
  moisPrecedent,
  moisSuivant,
  type StatutPaiement,
} from '@/shared/lib/paiements'

vi.mock('@/features/paiements/hooks/useReglements', () => ({ useReglements: vi.fn() }))
// Le dialog monte ses propres requêtes : il n'est pas le sujet de ce test.
vi.mock('@/features/paiements/components/ReglementFormDialog', () => ({
  ReglementFormDialog: ({ cible }: { cible: { apprenant: string } | null }) =>
    cible ? <div role="dialog">Règlement {cible.apprenant}</div> : null,
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

const useReglementsMock = vi.mocked(useReglements)

const SESSION = { id: 's18', nom: 'Session 18', date_fin: '2026-06-30' }

/** Une ligne NOMINATIVE : une personne, un cours, une période. */
function ligne(
  apprenant: string,
  statut: StatutPaiement,
  montant_du = 15000,
  montant_recu = 0,
  extra: Partial<LigneFacturation> = {}
): LigneFacturation {
  return {
    inscription_id: `insc-${apprenant}`,
    apprenant_id: `app-${apprenant}`,
    mois: '2026-08',
    session_id: null,
    montant_du,
    montant_recu,
    statut,
    reglement: null,
    horsPeriode: false,
    apprenant,
    cours_libelle: 'Groupe Hifz',
    devise: 'XOF',
    tarifManquant: false,
    ...extra,
  }
}

function simuler(etat: Partial<ReturnType<typeof useReglements>>) {
  useReglementsMock.mockReturnValue({
    mode: 'mensuel',
    lignes: [],
    totaux: { du: 0, recu: 0, reste: 0 },
    parStatut: { paye: 0, partiel: 0, attente: 0, retard: 0 },
    autreMode: { nombre: 0, recu: 0 },
    session: SESSION,
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
    expect(screen.getByText(/chargement des règlements/i)).toBeInTheDocument()
  })

  /*
   * ⚠️ RÉGRESSION À NE PAS REFAIRE : `useReglements` accepte un drapeau `actif`,
   * pour que le tableau de bord n'interroge pas l'argent au nom d'un enseignant.
   * Une requête `enabled: false` n'est JAMAIS résolue par TanStack Query : si
   * `isPending` ne tenait pas compte du drapeau, l'écran resterait en chargement
   * pour toujours — un sablier éternel, pire qu'un message d'échec.
   */
  it('n’attend pas une requête qui ne partira jamais', () => {
    simuler({ isPending: false, lignes: [] })
    afficher()

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByText('Rien à facturer ce mois-ci')).toBeInTheDocument()
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
    expect(screen.getByText(/apprenants inscrits à un cours de cette session/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /voir mes cours/i })).toHaveAttribute(
      'href',
      '/cours'
    )
  })

  /*
   * ⚠️ LE point du grain nominatif : deux inscrits du MÊME cours, le même mois,
   * avec des statuts différents. Sous l'ancien grain `(cours, mois)`, cette
   * situation n'avait pas de représentation — il n'y avait qu'un total.
   */
  it('affiche une ligne par PERSONNE, pas par cours', () => {
    simuler({
      lignes: [
        ligne('Aïcha Diallo', 'paye', 15000, 15000),
        ligne('Omar Ndiaye', 'partiel', 15000, 5000),
        ligne('Fatou Sy', 'attente'),
        ligne('Moussa Ba', 'retard'),
      ],
      totaux: { du: 60000, recu: 20000, reste: 40000 },
    })

    afficher()

    // Chaque personne apparaît deux fois : tableau (≥ md) et carte (mobile).
    expect(screen.getAllByText('Aïcha Diallo')).toHaveLength(2)
    expect(screen.getAllByText('Omar Ndiaye')).toHaveLength(2)
    // Le cours, lui, est commun aux quatre.
    expect(screen.getAllByText('Groupe Hifz')).toHaveLength(8)
    expect(screen.getAllByText('Payé')).toHaveLength(2)
    expect(screen.getAllByText('Partiel')).toHaveLength(2)
    expect(screen.getAllByText('En attente')).toHaveLength(2)
    expect(screen.getAllByText('En retard')).toHaveLength(2)
  })

  it('affiche les totaux du mois', () => {
    simuler({
      lignes: [ligne('Aïcha Diallo', 'partiel', 15000, 5000)],
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
      lignes: [ligne('Moussa Ba', 'retard')],
      totaux: { du: 15000, recu: 0, reste: 15000 },
    })

    afficher()

    for (const mot of [/relanc/i, /impay/i, /rappel/i, /urgent/i]) {
      expect(screen.queryByText(mot)).not.toBeInTheDocument()
    }
  })

  it('ouvre la saisie d’un règlement depuis une ligne', async () => {
    simuler({ lignes: [ligne('Aïcha Diallo', 'attente')] })
    const utilisateur = userEvent.setup()

    afficher()

    await utilisateur.click(
      screen.getAllByRole('button', { name: /Enregistrer un règlement pour Aïcha Diallo/ })[0]!
    )

    expect(screen.getByRole('dialog')).toHaveTextContent('Règlement Aïcha Diallo')
  })

  it('démarre sur le mois courant et navigue d’un mois à l’autre', async () => {
    simuler({ lignes: [] })
    const utilisateur = userEvent.setup()

    afficher()

    expect(useReglementsMock.mock.calls[0]?.[0]).toBe(moisCourant())
    expect(screen.getByRole('button', { name: /mois courant/i })).toBeDisabled()

    await utilisateur.click(screen.getByRole('button', { name: /mois suivant/i }))
    expect(useReglementsMock.mock.calls.at(-1)?.[0]).toBe(moisSuivant(moisCourant()))

    await utilisateur.click(screen.getByRole('button', { name: /mois précédent/i }))
    expect(useReglementsMock.mock.calls.at(-1)?.[0]).toBe(moisCourant())

    await utilisateur.click(screen.getByRole('button', { name: /mois précédent/i }))
    expect(useReglementsMock.mock.calls.at(-1)?.[0]).toBe(moisPrecedent(moisCourant()))
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

  /*
   * ================== LE MODE FORFAIT (migration 0026) ==================
   *
   * Au forfait il n'y a qu'UNE période : la session. Un navigateur de mois y
   * donnerait l'illusion d'un choix qui n'existe pas, et laisserait croire que
   * l'apprenant doit quelque chose chaque mois.
   */
  it('remplace la navigation par le nom de la session au forfait', () => {
    simuler({
      mode: 'par_session',
      lignes: [ligne('Aïcha Diallo', 'attente', 120000, 0, { mois: null, session_id: 's18' })],
    })

    afficher()

    expect(screen.queryByRole('button', { name: /mois suivant/i })).not.toBeInTheDocument()
    expect(screen.getByText(/Forfait par session/)).toBeInTheDocument()
    expect(screen.getByText(/Session 18/)).toBeInTheDocument()
  })

  it('garde la navigation mensuelle dans l’autre mode', () => {
    simuler({ mode: 'mensuel', lignes: [] })

    afficher()

    expect(screen.getByRole('button', { name: /mois suivant/i })).toBeInTheDocument()
    expect(screen.getByText(/Au mois/)).toBeInTheDocument()
  })

  /*
   * ⚠️ La base REFUSE un forfait sur une session sans date de fin (P0080).
   * L'écran doit le dire AVANT la saisie : découvrir l'interdit au moment
   * d'enregistrer, après avoir compté l'argent, serait le pire moment.
   */
  it('avertit quand la session du forfait n’a pas de date de fin', () => {
    simuler({
      mode: 'par_session',
      session: { id: 's18', nom: 'Session perpétuelle', date_fin: null },
      lignes: [],
    })

    afficher()

    expect(screen.getByText(/n'a pas de date de fin/)).toBeInTheDocument()
    expect(screen.getByText(/donnez-lui une date de fin/i)).toBeInTheDocument()
  })

  it('n’avertit pas quand la session est bornée', () => {
    simuler({ mode: 'par_session', lignes: [] })

    afficher()

    expect(screen.queryByText(/n'a pas de date de fin/)).not.toBeInTheDocument()
  })

  /*
   * Après une bascule de mode, le tarif du nouveau mode n'est pas encore saisi.
   * L'inscription ne produit alors aucune période — elle disparaîtrait de
   * l'écran. Un tableau silencieusement incomplet vaut moins qu'une ligne qui
   * dit ce qui manque.
   */
  it('montre les inscriptions sans tarif plutôt que de les taire', () => {
    simuler({
      mode: 'par_session',
      lignes: [ligne('Aïcha Diallo', 'attente', 0, 0, { tarifManquant: true })],
    })

    afficher()

    expect(screen.getAllByText('Aïcha Diallo')).toHaveLength(2)
    expect(screen.getAllByText(/aucun tarif saisi pour ce mode/i).length).toBeGreaterThan(0)

    // Et l'action est fermée : enregistrer un montant nul n'aurait aucun sens.
    for (const bouton of screen.getAllByRole('button', {
      name: /Enregistrer un règlement pour Aïcha Diallo/,
    })) {
      expect(bouton).toBeDisabled()
    }
  })
})
