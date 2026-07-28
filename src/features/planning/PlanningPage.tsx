import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { getISODay } from 'date-fns'
import { CalendarDays, Loader2, TriangleAlert } from 'lucide-react'

import { CoursDetailDialog } from '@/features/cours/components/CoursDetailDialog'
import { CoursFormDialog } from '@/features/cours/components/CoursFormDialog'
import type { CoursValues } from '@/features/cours/coursSchema'
import { useCours } from '@/features/cours/hooks/useCours'
import { useModifierCours } from '@/features/cours/hooks/useModifierCours'
import { useTousLesCreneaux } from '@/features/cours/hooks/useTousLesCreneaux'
import { useTypesCours } from '@/features/cours/hooks/useTypesCours'
import { GrilleHebdomadaire } from '@/features/planning/components/GrilleHebdomadaire'
import { SelecteurJour } from '@/features/planning/components/SelecteurJour'
import {
  calculerPlageHoraire,
  construireBlocs,
  extraireCreneaux,
  JOURS_ISO,
  joursEnConflit as calculerJoursEnConflit,
} from '@/features/planning/grilleHoraire'
import type { JourSemaine } from '@/shared/lib/conflits'
import { nombreInscrits, type CoursAvecDetails } from '@/shared/supabase/coursRepo'
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'

/** Jour ISO du jour même (1 = lundi … 7 = dimanche), comme `jour_semaine`. */
function jourCourant(): JourSemaine {
  return getISODay(new Date()) as JourSemaine
}

export function PlanningPage() {
  const { data: cours, isPending, isError, error } = useCours()
  const { data: typesCours } = useTypesCours()
  const { data: creneauxExistants } = useTousLesCreneaux()
  const modifier = useModifierCours()

  const [jourMobile, setJourMobile] = useState<JourSemaine>(jourCourant)
  const [coursDetaille, setCoursDetaille] = useState<CoursAvecDetails | null>(null)
  const [coursEdite, setCoursEdite] = useState<CoursAvecDetails | null>(null)

  const listeCours = useMemo(() => cours ?? [], [cours])

  const plage = useMemo(() => calculerPlageHoraire(extraireCreneaux(listeCours)), [listeCours])
  const blocs = useMemo(() => construireBlocs(listeCours, plage), [listeCours, plage])
  const joursAvecConflit = useMemo(() => calculerJoursEnConflit(blocs), [blocs])

  const nombreEnConflit = blocs.filter((bloc) => bloc.enConflit).length

  // Un clic sur un bloc mène au détail : on voit le cours et ses apprenants
  // avant de décider de le modifier.
  function ouvrirCours(coursId: string) {
    setCoursDetaille(listeCours.find((unCours) => unCours.id === coursId) ?? null)
  }

  function ouvrirEdition(unCours: CoursAvecDetails) {
    setCoursDetaille(null)
    setCoursEdite(unCours)
  }

  async function enregistrer(valeurs: CoursValues) {
    if (!coursEdite) return
    const { creneaux, ...champsCours } = valeurs
    await modifier.mutateAsync({ id: coursEdite.id, cours: champsCours, creneaux })
    setCoursEdite(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Planning</h1>
          <p className="text-sm text-muted-foreground">
            Votre semaine type. Cliquez sur un cours pour le modifier.
          </p>
        </div>
      </div>

      {nombreEnConflit > 0 && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertTitle>
            {nombreEnConflit === 1
              ? '1 créneau en conflit'
              : `${nombreEnConflit} créneaux en conflit`}
          </AlertTitle>
          <AlertDescription>
            Deux cours occupent le même horaire. Vous ne pouvez en donner qu'un à la fois :
            modifiez l'un des deux créneaux.
          </AlertDescription>
        </Alert>
      )}

      {isPending && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Chargement du planning…
        </div>
      )}

      {isError && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertTitle>Chargement impossible</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {!isPending && !isError && listeCours.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <CalendarDays className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-medium">Votre semaine est vide</p>
            <p className="text-sm text-muted-foreground">
              Créez un premier cours et placez ses créneaux : ils apparaîtront ici.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/cours">Créer un cours</Link>
          </Button>
        </div>
      )}

      {!isPending && !isError && listeCours.length > 0 && (
        <div className="space-y-3">
          <SelecteurJour
            jourActif={jourMobile}
            onChangerJour={setJourMobile}
            joursEnConflit={joursAvecConflit}
          />

          {/* Mobile : un seul jour. Desktop : la semaine entière. */}
          <GrilleHebdomadaire
            jours={[jourMobile]}
            blocs={blocs}
            plage={plage}
            onOuvrirCours={ouvrirCours}
            className="md:hidden"
          />
          <GrilleHebdomadaire
            jours={JOURS_ISO}
            blocs={blocs}
            plage={plage}
            onOuvrirCours={ouvrirCours}
            className="hidden md:grid"
          />
        </div>
      )}

      <CoursDetailDialog
        cours={coursDetaille}
        onOuvertChange={(ouvert) => {
          if (!ouvert) setCoursDetaille(null)
        }}
        onModifier={ouvrirEdition}
      />

      <CoursFormDialog
        ouvert={Boolean(coursEdite)}
        onOuvertChange={(ouvert) => {
          if (!ouvert) setCoursEdite(null)
        }}
        cours={coursEdite}
        typesCours={typesCours ?? []}
        creneauxExistants={creneauxExistants ?? []}
        onEnregistrer={enregistrer}
        enCours={modifier.isPending}
        erreur={modifier.error?.message ?? null}
        nbInscrits={coursEdite ? nombreInscrits(coursEdite) : 0}
      />
    </div>
  )
}
