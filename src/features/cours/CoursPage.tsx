import { useState } from 'react'
import { CalendarDays, Loader2, Plus, TriangleAlert } from 'lucide-react'

import { CoursDetailDialog } from '@/features/cours/components/CoursDetailDialog'
import { CoursFormDialog } from '@/features/cours/components/CoursFormDialog'
import { CoursListe } from '@/features/cours/components/CoursListe'
import { SupprimerCoursDialog } from '@/features/cours/components/SupprimerCoursDialog'
import type { CoursValues } from '@/features/cours/coursSchema'
import { useCours } from '@/features/cours/hooks/useCours'
import { useCreerCours } from '@/features/cours/hooks/useCreerCours'
import { useModifierCours } from '@/features/cours/hooks/useModifierCours'
import { useMembre } from '@/features/membres/hooks/useMembre'
import { useMembres } from '@/features/membres/hooks/useMembres'
import { useSupprimerCours } from '@/features/cours/hooks/useSupprimerCours'
import { useTousLesCreneaux } from '@/features/cours/hooks/useTousLesCreneaux'
import { useTypesCours } from '@/features/cours/hooks/useTypesCours'
import { nombreInscrits, type CoursAvecDetails } from '@/shared/supabase/coursRepo'
import { useSessionActive } from '@/features/sessions/hooks/useSessions'
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'

/** Sépare les champs du cours de ses créneaux avant l'appel au repository. */
function decouper(valeurs: CoursValues) {
  const { creneaux, ...cours } = valeurs
  return { cours, creneaux }
}

export function CoursPage() {
  const { data: cours, isPending, isError, error } = useCours()
  const { sessionId } = useSessionActive()
  const { data: typesCours } = useTypesCours()
  const { data: creneauxExistants } = useTousLesCreneaux()

  const creer = useCreerCours()
  const modifier = useModifierCours()
  // Créer, modifier et supprimer un cours sont des actes de gestion : la RLS les
  // refuse à un enseignant (migration 0012). On ne lui montre pas les commandes.
  // Un cours créé est affecté à son créateur — c'est ce que fait
  // `enregistrer_cours`. L'aperçu de conflit doit viser le même agenda.
  const { estResponsable, userId } = useMembre()
  const { data: membres } = useMembres()
  const supprimer = useSupprimerCours()

  const [formulaireOuvert, setFormulaireOuvert] = useState(false)
  const [coursEdite, setCoursEdite] = useState<CoursAvecDetails | null>(null)
  const [coursASupprimer, setCoursASupprimer] = useState<CoursAvecDetails | null>(null)

  /**
   * Le détail est repéré par son **identifiant**, pas par une copie du cours.
   * Une copie figée au moment du clic ne verrait aucune mutation faite depuis
   * le dialogue lui-même — activer le partage n'y ferait jamais apparaître le
   * lien, alors qu'il existe bien en base.
   */
  const [idDetaille, setIdDetaille] = useState<string | null>(null)
  const coursDetaille = (cours ?? []).find((unCours) => unCours.id === idDetaille) ?? null

  function ouvrirCreation() {
    setCoursEdite(null)
    creer.reset()
    modifier.reset()
    setFormulaireOuvert(true)
  }

  function ouvrirEdition(unCours: CoursAvecDetails) {
    setIdDetaille(null)
    setCoursEdite(unCours)
    creer.reset()
    modifier.reset()
    setFormulaireOuvert(true)
  }

  async function enregistrer(valeurs: CoursValues) {
    const { cours: champsCours, creneaux } = decouper(valeurs)

    if (coursEdite) {
      await modifier.mutateAsync({ id: coursEdite.id, cours: champsCours, creneaux })
    } else {
      await creer.mutateAsync({ cours: champsCours, creneaux })
    }

    setFormulaireOuvert(false)
    setCoursEdite(null)
  }

  function confirmerSuppression() {
    if (!coursASupprimer) return
    supprimer.mutate(coursASupprimer.id, {
      onSuccess: () => setCoursASupprimer(null),
    })
  }

  /*
   * Les niveaux proposés à la saisie sont ceux DÉJÀ employés dans le centre.
   * C'est ce qui tient la cohérence sans table de référence : on retape rarement
   * ce qu'on peut choisir.
   */
  const niveaux = [
    ...new Set((cours ?? []).map((unCours) => unCours.niveau).filter((n): n is string => !!n)),
  ].sort((a, b) => a.localeCompare(b, 'fr'))

  const erreurFormulaire = coursEdite ? modifier.error?.message : creer.error?.message

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cours</h1>
          <p className="text-sm text-muted-foreground">
            Vos cours récurrents et leurs créneaux hebdomadaires.
          </p>
        </div>

        {estResponsable && (
          <Button onClick={ouvrirCreation}>
            <Plus className="size-4" aria-hidden="true" />
            Nouveau cours
          </Button>
        )}
      </div>

      {supprimer.isError && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertTitle>Suppression impossible</AlertTitle>
          <AlertDescription>{supprimer.error.message}</AlertDescription>
        </Alert>
      )}

      {isPending && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Chargement des cours…
        </div>
      )}

      {isError && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertTitle>Chargement impossible</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {!isPending && !isError && cours.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <CalendarDays className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-medium">Aucun cours pour le moment</p>
            <p className="text-sm text-muted-foreground">
              {estResponsable
                ? 'Créez un cours et placez ses créneaux dans la semaine.'
                : "Aucun cours ne vous est affecté pour l'instant."}
            </p>
          </div>
          {estResponsable && (
            <Button variant="outline" onClick={ouvrirCreation}>
              <Plus className="size-4" aria-hidden="true" />
              Nouveau cours
            </Button>
          )}
        </div>
      )}

      {!isPending && !isError && cours.length > 0 && (
        <CoursListe
          cours={cours}
          onOuvrir={(unCours) => setIdDetaille(unCours.id)}
          onModifier={ouvrirEdition}
          onSupprimer={setCoursASupprimer}
          actionsGestion={estResponsable}
        />
      )}

      <CoursDetailDialog
        cours={coursDetaille}
        onOuvertChange={(ouvert) => {
          if (!ouvert) setIdDetaille(null)
        }}
        onModifier={ouvrirEdition}
      />

      <CoursFormDialog
        ouvert={formulaireOuvert}
        onOuvertChange={setFormulaireOuvert}
        cours={coursEdite}
        typesCours={typesCours ?? []}
        creneauxExistants={creneauxExistants ?? []}
        enseignantId={coursEdite?.enseignant_id ?? userId}
        membres={membres ?? []}
        sessionId={sessionId ?? ''}
        niveaux={niveaux}
        onEnregistrer={enregistrer}
        enCours={creer.isPending || modifier.isPending}
        erreur={erreurFormulaire ?? null}
        nbInscrits={coursEdite ? nombreInscrits(coursEdite) : 0}
      />

      <SupprimerCoursDialog
        cours={coursASupprimer}
        onOuvertChange={(ouvert) => {
          if (!ouvert) setCoursASupprimer(null)
        }}
        onConfirmer={confirmerSuppression}
        enCours={supprimer.isPending}
      />
    </div>
  )
}
