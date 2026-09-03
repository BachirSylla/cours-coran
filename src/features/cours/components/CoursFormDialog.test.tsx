import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CoursFormDialog } from '@/features/cours/components/CoursFormDialog'
import type { CreneauExistant } from '@/features/cours/conflitsCours'
import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'
import type { Membre } from '@/shared/supabase/membreRepo'
import type { TypeCours } from '@/shared/supabase/typeCoursRepo'

/**
 * Affectation d'un cours à un enseignant (migration 0014) et conséquence
 * immédiate : l'aperçu de conflit change d'agenda avec le sélecteur.
 *
 * Ce qui est vérifié ici est ce que le formulaire **transmet**, jamais ce que
 * la base accepte — cette frontière-là est éprouvée par
 * `supabase/tests/rls_etancheite.sql`.
 */
// De vrais UUID : le schéma refuse toute autre forme, et un identifiant
// fantaisiste ferait échouer la validation pour une raison sans rapport.
const MOI = '11111111-1111-4111-8111-111111111111'
const AUTRE = '22222222-2222-4222-8222-222222222222'

const TYPES: TypeCours[] = [
  {
    id: '33333333-3333-4333-8333-333333333333',
    libelle: 'Mémorisation',
    created_at: '2026-01-01T00:00:00Z',
  },
]

function membre(user_id: string, nom_affiche: string, role = 'enseignant'): Membre {
  return {
    id: `membre-${user_id}`,
    centre_id: 'centre-1',
    user_id,
    role,
    nom_affiche,
    note_bareme: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

const MEMBRES = [membre(MOI, 'Moi', 'responsable'), membre(AUTRE, 'Bilal')]

/** Un vrai UUID : le schéma valide la session, une étiquette ne passerait pas. */
const SESSION_ID = '9a2d1b4c-6e8f-4a0b-9c3d-5e7f1a2b3c4d'

/** Lundi 10:00–11:00 est déjà pris — par `enseignant_id`. */
function occupe(enseignant_id: string | null): CreneauExistant {
  return {
    id: 'creneau-1',
    cours_id: 'cours-existant',
    cours_libelle: 'Groupe Hifz',
    enseignant_id,
    session_id: SESSION_ID,
    jour_semaine: 1,
    heure_debut: '10:00:00',
    heure_fin: '11:00:00',
  }
}

function cours(extra: Partial<CoursAvecDetails> = {}): CoursAvecDetails {
  return {
    id: 'c1',
    centre_id: 'centre-1',
    enseignant_id: AUTRE,
    libelle: 'Tajwid du soir',
    type_cours_id: '33333333-3333-4333-8333-333333333333',
    format: 'individuel',
    date_debut: '2026-07-01',
    date_fin: null,
    lien_meet: null,
    jeton_partage: null,
    session_id: 'session-1',
    niveau: null,
    reconduit_de: null,
    logo: null,
    assiduite_active: null,
    base_academique: null,
    bareme_assiduite: null,
    penalite_absence: null,
    penalite_retard: null,
    penaliser_absences_excusees: null,
    statut: 'actif',
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
    type_cours: { libelle: 'Mémorisation' },
    inscription: [{ count: 0 }],
    tarif: [],
    creneau: [
      {
        id: 'creneau-c1',
        centre_id: 'centre-1',
        cours_id: 'c1',
        jour_semaine: 1,
        heure_debut: '10:00:00',
        heure_fin: '11:00:00',
        created_at: '2026-07-01T10:00:00Z',
        updated_at: '2026-07-01T10:00:00Z',
      },
    ],
    ...extra,
  }
}

const onEnregistrer = vi.fn()

function afficher(props: Partial<Parameters<typeof CoursFormDialog>[0]> = {}) {
  render(
    <CoursFormDialog
      ouvert
      onOuvertChange={vi.fn()}
      typesCours={TYPES}
      creneauxExistants={[]}
      enseignantId={MOI}
      sessionId={SESSION_ID}
      membres={MEMBRES}
      onEnregistrer={onEnregistrer}
      enCours={false}
      {...props}
    />
  )

  return userEvent.setup()
}

const selecteur = () => screen.getByLabelText('Enseignant')

describe('CoursFormDialog — affectation à un enseignant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ne propose rien tant qu’il n’y a personne d’autre', () => {
    // Non-régression de l'enseignant seul : il n'a pas à choisir entre lui-même
    // et lui-même.
    afficher({ membres: [membre(MOI, 'Moi', 'responsable')] })

    expect(screen.queryByLabelText('Enseignant')).not.toBeInTheDocument()
  })

  it('propose les membres du centre, soi-même par défaut', () => {
    afficher()

    expect(selecteur()).toHaveTextContent('Moi')
  })

  it('reprend l’enseignant déjà affecté en modification', () => {
    afficher({ cours: cours(), enseignantId: AUTRE })

    expect(selecteur()).toHaveTextContent('Bilal')
  })

  it('transmet l’enseignant choisi à l’enregistrement', async () => {
    const utilisateur = afficher()

    await utilisateur.type(screen.getByLabelText('Libellé'), 'Nouveau cours')
    await utilisateur.click(screen.getByLabelText('Type de cours'))
    await utilisateur.click(screen.getByRole('option', { name: 'Mémorisation' }))
    await utilisateur.click(selecteur())
    await utilisateur.click(screen.getByRole('option', { name: 'Bilal' }))
    await utilisateur.click(screen.getByRole('button', { name: 'Créer' }))

    expect(onEnregistrer).toHaveBeenCalledTimes(1)
    expect(onEnregistrer.mock.calls[0]?.[0]).toMatchObject({ enseignant_id: AUTRE })
  })
})

describe('CoursFormDialog — l’aperçu de conflit suit l’agenda choisi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('signale le chevauchement sur l’agenda de l’enseignant visé', () => {
    // Le créneau par défaut du formulaire est lundi 10:00–11:00, déjà pris.
    afficher({ creneauxExistants: [occupe(MOI)] })

    expect(screen.getByText(/chevauche le cours « Groupe Hifz »/)).toBeInTheDocument()
  })

  it('ne signale rien quand le créneau est pris par quelqu’un d’autre', () => {
    afficher({ creneauxExistants: [occupe(AUTRE)] })

    expect(screen.queryByText(/chevauche le cours/)).not.toBeInTheDocument()
  })

  it('recalcule dès qu’on change d’enseignant, sans rien enregistrer', async () => {
    const utilisateur = afficher({ creneauxExistants: [occupe(MOI)] })

    expect(screen.getByText(/chevauche le cours « Groupe Hifz »/)).toBeInTheDocument()

    await utilisateur.click(selecteur())
    await utilisateur.click(screen.getByRole('option', { name: 'Bilal' }))

    // Bilal est libre à cette heure-là : l'alerte disparaît sur-le-champ.
    expect(screen.queryByText(/chevauche le cours/)).not.toBeInTheDocument()
  })
})
