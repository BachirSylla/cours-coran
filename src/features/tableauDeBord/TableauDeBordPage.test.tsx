import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TableauDeBordPage } from '@/features/tableauDeBord/TableauDeBordPage'
import { useTableauDeBord } from '@/features/tableauDeBord/hooks/useTableauDeBord'

vi.mock('@/features/tableauDeBord/hooks/useTableauDeBord', () => ({
  useTableauDeBord: vi.fn(),
}))

const useTableauDeBordMock = vi.mocked(useTableauDeBord)

type Etat = ReturnType<typeof useTableauDeBord>

function simuler(extra: Partial<Etat> = {}) {
  useTableauDeBordMock.mockReturnValue({
    voitArgent: true,
    mode: 'mensuel',
    session: { id: 's18', nom: 'Session 18', date_fin: '2026-06-30', statut: 'en_cours' },
    libellePeriode: 'mars 2026',
    devise: 'XOF',
    argent: { encaisse: 120000, reste: 45000, du: 165000, recouvrement: 73, enRetard: 3 },
    impayes: [
      {
        inscription_id: 'i1',
        apprenant_id: 'a1',
        apprenant: 'Aïcha Diallo',
        cours_libelle: 'Groupe Hifz',
        periode: 'mars 2026',
        montant_du: 15000,
        montant_recu: 0,
        reste: 15000,
        devise: 'XOF',
        statut: 'retard',
      },
    ],
    encaissements: [
      { mois: '2026-02', montant: 90000 },
      { mois: '2026-03', montant: 120000 },
    ],
    pedagogie: { aNoter: 2, plusAncienneANoter: '2026-03-01', seancesTenues: 18, aVenir: 4 },
    seancesPassees: 20,
    aDesEncaissements: true,
    assiduite: {
      present: 40,
      retard: 3,
      absent: 5,
      excuse: 2,
      partiel: 0,
      total: 50,
      taux: 86,
    },
    coursDuJour: [
      {
        cours_id: 'c1',
        libelle: 'Groupe Hifz',
        heure_debut: '10:00:00',
        heure_fin: '11:00:00',
        enseignant: 'Amina Bâ',
        lien: 'https://exemple.test/salle',
        aNoter: true,
      },
    ],
    alertes: [
      {
        cle: 'seances-a-noter',
        gravite: 'attention',
        titre: '2 séances à renseigner',
        detail: 'La plus ancienne attend depuis 14 jours.',
        lien: '/seances',
      },
    ],
    enseignants: [
      { user_id: 'u1', nom: 'Amina Bâ', cours: 2, apprenants: 9, aNoter: 2 },
    ],
    renouvellement: { revenus: 8, partis: 2, nouveaux: 3, retention: 80 },
    apprenantsActifs: 11,
    coursActifs: 4,
    coursTermines: 1,
    isPending: false,
    isError: false,
    error: null,
    ...extra,
  } as Etat)
}

function afficher() {
  return render(
    <MemoryRouter>
      <TableauDeBordPage />
    </MemoryRouter>
  )
}

describe('TableauDeBordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    simuler()
  })

  it('annonce la session et la période couverte', () => {
    afficher()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tableau de bord')
    expect(screen.getByText(/Session 18 · mars 2026/)).toBeInTheDocument()
  })

  it('met en avant ce qu’il reste à encaisser', () => {
    afficher()

    expect(screen.getByText('Reste à encaisser')).toBeInTheDocument()
    expect(screen.getByText(/45\s?000/)).toBeInTheDocument()
    expect(screen.getByText(/3 personnes concernées/)).toBeInTheDocument()
  })

  it('nomme les impayés, avec le reste dû', () => {
    afficher()

    expect(screen.getByText("Qui n'a pas payé")).toBeInTheDocument()
    expect(screen.getByText('Aïcha Diallo')).toBeInTheDocument()
    expect(screen.getByText(/Groupe Hifz · mars 2026/)).toBeInTheDocument()
  })

  /*
   * ⚠️ LA FRONTIÈRE, et c'est l'assertion la plus importante de ce fichier.
   * Un enseignant n'a rien à faire des finances du centre — la RLS le lui refuse
   * déjà, mais l'écran ne doit pas non plus lui présenter des cartes vides qui
   * se liraient comme une panne.
   */
  it('ne montre AUCUNE finance à un enseignant', () => {
    simuler({
      voitArgent: false,
      argent: null,
      impayes: [],
      encaissements: [],
      aDesEncaissements: false,
      enseignants: [],
    })
    const { container } = afficher()

    expect(screen.queryByText("Qui n'a pas payé")).not.toBeInTheDocument()
    expect(screen.queryByText('Reste à encaisser')).not.toBeInTheDocument()
    expect(screen.queryByText('Encaissé')).not.toBeInTheDocument()
    expect(screen.queryByText('Encaissements')).not.toBeInTheDocument()
    expect(screen.queryByText('Par enseignant')).not.toBeInTheDocument()
    expect(screen.queryByText('Recouvrement')).not.toBeInTheDocument()

    // Aucun montant nulle part : ni devise, ni chiffre d'argent.
    expect(container.textContent).not.toMatch(/XOF|F\s?CFA/)
    expect(container.textContent).not.toMatch(/45\s?000|120\s?000/)
  })

  it('donne à l’enseignant sa version pédagogique', () => {
    simuler({
      voitArgent: false,
      argent: null,
      impayes: [],
      encaissements: [],
      aDesEncaissements: false,
    })
    afficher()

    expect(screen.getByText('Séances à renseigner')).toBeInTheDocument()
    expect(screen.getByText('Mes cours')).toBeInTheDocument()
    expect(screen.getByText("Aujourd'hui")).toBeInTheDocument()
    expect(screen.getByText('Assiduité')).toBeInTheDocument()
  })

  it('liste les cours du jour, avec un lien générique', () => {
    afficher()

    expect(screen.getByText('10:00')).toBeInTheDocument()
    // Le nom figure aussi dans « Par enseignant » : deux occurrences attendues.
    expect(screen.getAllByText('Amina Bâ')).toHaveLength(2)

    /*
     * ⚠️ « Lien », jamais « Meet » : ce n'est qu'une URL, et tous les centres ne
     * sont pas sur Google. Nommer l'outil serait faux pour une partie d'entre
     * eux.
     */
    const lien = screen.getByRole('link', { name: /^Lien$/ })
    expect(lien).toHaveAttribute('href', 'https://exemple.test/salle')
    expect(screen.queryByText(/meet/i)).not.toBeInTheDocument()
  })

  it('signale une séance tenue mais non renseignée', () => {
    afficher()

    expect(screen.getByText('À noter')).toBeInTheDocument()
  })

  it('affiche les alertes, la plus grave en tête', () => {
    afficher()

    expect(screen.getByText('À traiter')).toBeInTheDocument()
    expect(screen.getByText('2 séances à renseigner')).toBeInTheDocument()
  })

  it('se tait quand il n’y a rien à traiter', () => {
    simuler({ alertes: [] })
    afficher()

    expect(screen.queryByText('À traiter')).not.toBeInTheDocument()
  })

  /*
   * ⚠️ L'ÉTAT VIDE. Un centre neuf ne doit ni planter, ni afficher « 0 % »
   * d'assiduité — un reproche adressé à quelqu'un qui n'a encore rien manqué.
   */
  it('supporte un centre neuf sans rien inventer', () => {
    simuler({
      argent: { encaisse: 0, reste: 0, du: 0, recouvrement: null, enRetard: 0 },
      impayes: [],
      encaissements: [],
      aDesEncaissements: false,
      seancesPassees: 0,
      coursDuJour: [],
      alertes: [],
      enseignants: [],
      renouvellement: null,
      apprenantsActifs: 0,
      coursActifs: 0,
      coursTermines: 0,
      pedagogie: { aNoter: 0, plusAncienneANoter: null, seancesTenues: 0, aVenir: 0 },
      assiduite: { present: 0, retard: 0, absent: 0, excuse: 0, partiel: 0, total: 0, taux: null },
    })
    const { container } = afficher()

    // Deux fois : le détail de la tuile, et l'état vide de la liste.
    expect(screen.getAllByText('Tout est réglé').length).toBeGreaterThan(0)
    expect(screen.getByText("Aucun cours aujourd'hui")).toBeInTheDocument()
    expect(screen.getByText('Aucun cours actif dans cette session.')).toBeInTheDocument()
    // Ni « 0 % », ni « NaN » nulle part.
    expect(container.textContent).not.toMatch(/NaN|Infinity/)
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
  })

  it('cache la réinscription tant qu’il n’y a rien à comparer', () => {
    simuler({ renouvellement: null })
    afficher()

    expect(screen.queryByText('Réinscriptions')).not.toBeInTheDocument()
  })

  it('patiente sans rien affirmer pendant le chargement', () => {
    simuler({ isPending: true })
    afficher()

    expect(screen.getByRole('status')).toHaveTextContent('Chargement du tableau de bord…')
    expect(screen.queryByText('Reste à encaisser')).not.toBeInTheDocument()
  })

  it('remonte une erreur de chargement sans laisser l’écran vide', () => {
    simuler({ isError: true, error: new Error('Session expirée.') })
    afficher()

    expect(screen.getByText('Chargement impossible')).toBeInTheDocument()
    expect(screen.getByText('Session expirée.')).toBeInTheDocument()
  })
})
