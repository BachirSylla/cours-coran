import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useRapportCours } from '@/features/rapport/hooks/useRapportCours'
import { RapportSessionPage } from '@/features/rapport/RapportSessionPage'
import { NOTATION_PAR_DEFAUT } from '@/shared/lib/rapport'
import {
  construireRapport,
  type InscritRapport,
  type SeanceRapport,
} from '@/shared/lib/rapportSession'
import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'

vi.mock('@/features/rapport/hooks/useRapportCours', () => ({ useRapportCours: vi.fn() }))

const useRapportMock = vi.mocked(useRapportCours)

function seance(
  id: string,
  date: string,
  presence: SeanceRapport['presence'] = [],
  extra: Partial<SeanceRapport> = {}
): SeanceRapport {
  return {
    id,
    date,
    statut: 'faite',
    sourate: null,
    versets_de: null,
    versets_a: null,
    contenu_aborde: null,
    presence,
    ...extra,
  }
}

const SEANCES: SeanceRapport[] = [
  seance(
    's1',
    '2026-03-15',
    [
      { apprenant_id: 'a1', etat: 'present', present: true, note: 7.25, note_bareme: 10 },
      { apprenant_id: 'a2', etat: 'retard', present: true, note: null, note_bareme: null },
    ],
    { sourate: 'Aṭ-Ṭûr', versets_de: 1, versets_a: 14 }
  ),
  seance('s2', '2026-03-22', [
    { apprenant_id: 'a1', etat: 'absent', present: false, note: null, note_bareme: null },
    { apprenant_id: 'a2', etat: 'excuse', present: false, note: null, note_bareme: null },
  ]),
]

const INSCRITS: InscritRapport[] = [
  { apprenant_id: 'a1', prenom: 'Salif', nom: 'Anne', note_examen: 16, examen_bareme: 20 },
  { apprenant_id: 'a2', prenom: 'Adja', nom: 'Diao', note_examen: null, examen_bareme: null },
]

function simuler(
  options: {
    seances?: SeanceRapport[]
    inscrits?: InscritRapport[]
    config?: typeof NOTATION_PAR_DEFAUT
    logo?: string | null
    etat?: Partial<ReturnType<typeof useRapportCours>>
  } = {}
) {
  const rapport = construireRapport({
    seances: options.seances ?? SEANCES,
    inscrits: options.inscrits ?? INSCRITS,
    config: options.config ?? NOTATION_PAR_DEFAUT,
    periode: { debut: null, fin: null },
  })

  useRapportMock.mockReturnValue({
    cours: { libelle: 'Groupe Hifz' } as CoursAvecDetails,
    rapport,
    logo: options.logo ?? null,
    isPending: false,
    isError: false,
    error: null,
    ...options.etat,
  })

  return rapport
}

function rendre(recherche = '') {
  return render(
    <MemoryRouter initialEntries={[`/cours/c1/rapport${recherche}`]}>
      <Routes>
        <Route path="/cours/:coursId/rapport" element={<RapportSessionPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('RapportSessionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche un indicateur pendant la préparation', () => {
    simuler({ etat: { isPending: true, rapport: null } })

    rendre()

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('affiche l’erreur en cas d’échec', () => {
    simuler({ etat: { isError: true, error: new Error('Session expirée.'), rapport: null } })

    rendre()

    expect(screen.getByText('Session expirée.')).toBeInTheDocument()
  })

  it('affiche l’en-tête et la période observée', () => {
    simuler()

    rendre()

    expect(
      screen.getByRole('heading', { name: 'Rapport de fin de session', level: 1 })
    ).toBeInTheDocument()
    expect(screen.getByText(/du 15\/03\/2026 au 22\/03\/2026/)).toBeInTheDocument()
  })

  it('affiche le badge Niveau · Session issu de l’URL', () => {
    simuler()

    rendre('?niveau=9&session=16')

    expect(screen.getByText('Niveau 9 · Session 16')).toBeInTheDocument()
  })

  it('n’affiche aucun badge quand ni niveau ni session ne sont donnés', () => {
    simuler()

    rendre()

    expect(screen.queryByText(/^Niveau /)).not.toBeInTheDocument()
  })

  it('affiche les trois cartes de synthèse', () => {
    simuler()

    rendre()

    expect(screen.getByText('Moyenne finale de la classe')).toBeInTheDocument()
    expect(screen.getByText('Présence moyenne')).toBeInTheDocument()
    expect(screen.getByText('Meilleure note')).toBeInTheDocument()
    // Un seul examen saisi. Base par défaut « moyenne des devoirs et de
    // l'examen » : devoir 7,25/10 → 14,5/20, examen 16/20 → moyenne 15,25/20,
    // ramenée sur 17 → 12,96 ; plus 2,5 d'assiduité (une absence sèche sur deux
    // séances) = 15,46.
    expect(screen.getAllByText('15,46').length).toBeGreaterThan(0)
  })

  it('affiche une ligne par apprenant, trié par nom', () => {
    simuler()

    rendre()

    const noms = screen.getAllByText('Anne')
    expect(noms.length).toBe(2) // présence + notes
    expect(screen.getAllByText('Diao').length).toBe(2)
  })

  it('marque chaque état de présence avec sa lettre', () => {
    simuler()

    rendre()

    // Salif : présent puis absent. Adja : retard puis excusée.
    expect(screen.getByTitle('Présent — 15/03')).toHaveTextContent('P')
    expect(screen.getByTitle('Absent — 22/03')).toHaveTextContent('A')
    expect(screen.getByTitle('En retard — 15/03')).toHaveTextContent('R')
    expect(screen.getByTitle('Absent (excusé) — 22/03')).toHaveTextContent('E')
  })

  it('titre les colonnes de notes par le contenu travaillé', () => {
    simuler()

    rendre()

    expect(screen.getByRole('columnheader', { name: 'Aṭ-Ṭûr v1–14' })).toBeInTheDocument()
  })

  it('affiche la note finale et laisse un tiret sans examen', () => {
    const rapport = simuler()

    rendre()

    expect(rapport.lignes.find((ligne) => ligne.nom === 'Diao')?.finale).toBeNull()
    // Adja n'a pas d'examen : sa note finale reste vide.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('fait suivre au libellé « Note » le barème académique configuré', () => {
    simuler({ config: { ...NOTATION_PAR_DEFAUT, bareme_academique: 15, bareme_assiduite: 5 } })

    rendre()

    // Le `<br>` du libellé rend l'espace incertain dans le nom accessible.
    expect(screen.getByRole('columnheader', { name: /Note\s*\/\s*15/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Assiduité\s*\/\s*5/ })).toBeInTheDocument()
  })

  it('fait suivre au libellé « Examen » le barème réel', () => {
    simuler({
      inscrits: [
        { apprenant_id: 'a1', prenom: 'Salif', nom: 'Anne', note_examen: 8, examen_bareme: 10 },
      ],
    })

    rendre()

    expect(screen.getByRole('columnheader', { name: /Examen\s*\/\s*10/ })).toBeInTheDocument()
  })

  it('n’annonce aucun barème d’examen quand ils diffèrent', () => {
    // Chaque note porte alors le sien, sans quoi un 9/10 se lirait comme 9/20.
    simuler({
      inscrits: [
        { apprenant_id: 'a1', prenom: 'Salif', nom: 'Anne', note_examen: 8, examen_bareme: 10 },
        { apprenant_id: 'a2', prenom: 'Adja', nom: 'Diao', note_examen: 16, examen_bareme: 20 },
      ],
    })

    rendre()

    const entete = screen.getByRole('columnheader', { name: 'Examen' })
    expect(entete).toBeInTheDocument()
    expect(screen.getByText('8/10')).toBeInTheDocument()
    expect(screen.getByText('16/20')).toBeInTheDocument()
  })

  it('affiche la légende des cinq états', () => {
    simuler()

    rendre()

    for (const libelle of [
      'Présent',
      'En retard',
      'Absent',
      'Absent (excusé)',
      'Présence partielle',
    ]) {
      expect(screen.getAllByText(libelle).length).toBeGreaterThan(0)
    }
  })

  it('signale un cours sans séance tenue', () => {
    simuler({ seances: [] })

    rendre()

    expect(screen.getByText('Aucune séance tenue sur cette période.')).toBeInTheDocument()
  })

  it('ouvre le dialogue d’impression une fois la page peinte', async () => {
    // `window.print` existe dans jsdom, mais n'est qu'un bouchon bruyant :
    // l'espion le neutralise et permet l'assertion.
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const utilisateur = userEvent.setup()
    simuler()

    rendre()
    await utilisateur.click(screen.getByRole('button', { name: /Imprimer/ }))

    await waitFor(() => expect(print).toHaveBeenCalledOnce())
  })

  it('n’imprime pas la barre d’actions', () => {
    simuler()

    rendre()

    expect(
      screen.getByRole('button', { name: /Imprimer/ }).closest('.print\\:hidden')
    ).not.toBeNull()
  })

  it('reprend le nom du cours dans le titre du document', () => {
    simuler()

    rendre()

    expect(document.title).toBe('Rapport — Groupe Hifz')
  })

  it('masque les colonnes Assiduité et Note quand l’assiduité est inactive', () => {
    simuler({ config: { ...NOTATION_PAR_DEFAUT, assiduite_active: false } })

    rendre()

    expect(screen.queryByRole('columnheader', { name: /Assiduité/ })).not.toBeInTheDocument()
    // La colonne « Note » répéterait la note finale à l'identique.
    expect(
      screen.queryByRole('columnheader', { name: /^Note\s*\/\s*17/ })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: /Note finale\s*\/\s*20/ })
    ).toBeInTheDocument()
  })

  it('garde les deux colonnes quand l’assiduité est active', () => {
    simuler()

    rendre()

    expect(screen.getByRole('columnheader', { name: /Assiduité/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /^Note\s*\/\s*17/ })).toBeInTheDocument()
  })

  it('affiche le logo du centre en en-tête quand il est défini', () => {
    simuler({ logo: 'data:image/png;base64,AAAA' })

    rendre()

    expect(screen.getByAltText('Logo du centre')).toHaveAttribute(
      'src',
      'data:image/png;base64,AAAA'
    )
  })

  it('n’affiche aucun emblème quand aucun logo n’est défini', () => {
    // Pas d'image de substitution : l'en-tête reste exactement celui d'avant.
    simuler()

    rendre()

    expect(screen.queryByAltText('Logo du centre')).not.toBeInTheDocument()
  })

  it('rend une icône sur chacune des trois cartes', () => {
    simuler()

    rendre()

    expect(screen.getAllByTestId('carte-icone')).toHaveLength(3)
  })

  it('affiche les totaux de présence par apprenant', () => {
    simuler()

    rendre()

    const ligne = screen.getByTitle('Présent — 15/03').closest('tr')
    expect(ligne).not.toBeNull()
    // Salif : 1 présence sur 2 séances.
    expect(within(ligne as HTMLElement).getByText('50 %')).toBeInTheDocument()
  })
})
