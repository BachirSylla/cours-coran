import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { addWeeks, startOfISOWeek } from 'date-fns'
import { CalendarCheck, Loader2, TriangleAlert } from 'lucide-react'

import { ListeSeancesJour } from '@/features/seances/components/ListeSeancesJour'
import { NavigateurSemaine } from '@/features/seances/components/NavigateurSemaine'
import { SeanceFormDialog } from '@/features/seances/components/SeanceFormDialog'
import { useSeancesSemaine } from '@/features/seances/hooks/useSeancesSemaine'
import { grouperParJour, type SeanceVueEnrichie } from '@/features/seances/regroupement'
import { chaineDepuisDate, dateDepuisChaine } from '@/shared/lib/seances'
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'

/** Lundi de la semaine contenant la date du jour. */
function lundiCourant(): string {
  return chaineDepuisDate(startOfISOWeek(new Date()))
}

function decalerSemaines(lundi: string, semaines: number): string {
  // Passage par dateDepuisChaine : `new Date('2026-07-27')` serait lu en UTC.
  return chaineDepuisDate(addWeeks(dateDepuisChaine(lundi), semaines))
}

function ajouterJours(date: string, jours: number): string {
  const resultat = dateDepuisChaine(date)
  resultat.setDate(resultat.getDate() + jours)
  return chaineDepuisDate(resultat)
}

export function SeancesSemainePage() {
  const [lundi, setLundi] = useState(lundiCourant)
  const [vueSaisie, setVueSaisie] = useState<SeanceVueEnrichie | null>(null)

  const dimanche = ajouterJours(lundi, 6)
  const aujourdhui = chaineDepuisDate(new Date())

  const { vues, isPending, isError, error } = useSeancesSemaine(lundi, dimanche)
  const groupes = useMemo(() => grouperParJour(vues), [vues])

  const estSemaineCourante = aujourdhui >= lundi && aujourdhui <= dimanche

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Séances</h1>
          <p className="text-sm text-muted-foreground">
            Ce qui s’est passé cette semaine. Cliquez sur une séance pour la saisir.
          </p>
        </div>

        <NavigateurSemaine
          debut={lundi}
          fin={dimanche}
          onPrecedente={() => setLundi(decalerSemaines(lundi, -1))}
          onSuivante={() => setLundi(decalerSemaines(lundi, 1))}
          onAujourdhui={() => setLundi(lundiCourant())}
          estSemaineCourante={estSemaineCourante}
        />
      </div>

      {isPending && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Chargement des séances…
        </div>
      )}

      {isError && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertTitle>Chargement impossible</AlertTitle>
          <AlertDescription>{error?.message}</AlertDescription>
        </Alert>
      )}

      {!isPending && !isError && groupes.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <CalendarCheck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-medium">Aucune séance cette semaine</p>
            <p className="text-sm text-muted-foreground">
              Seuls les cours actifs génèrent des séances à saisir.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/cours">Voir mes cours</Link>
          </Button>
        </div>
      )}

      {!isPending && !isError && groupes.length > 0 && (
        <div className="space-y-6">
          {groupes.map((groupe) => (
            <ListeSeancesJour
              key={groupe.date}
              groupe={groupe}
              estAujourdhui={groupe.date === aujourdhui}
              onOuvrir={setVueSaisie}
            />
          ))}
        </div>
      )}

      <SeanceFormDialog
        vue={vueSaisie}
        onOuvertChange={(ouvert) => {
          if (!ouvert) setVueSaisie(null)
        }}
      />
    </div>
  )
}
