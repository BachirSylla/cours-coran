import { BookOpen, Loader2, NotebookPen, TrendingUp, TriangleAlert } from 'lucide-react'

import { useProgressionApprenant } from '@/features/apprenants/hooks/useProgressionApprenant'
import type { ProgressionCours } from '@/features/apprenants/hooks/useProgressionApprenant'
import { formaterPosition } from '@/shared/lib/progression'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Badge } from '@/shared/ui/badge'

function formaterDate(date: string): string {
  const [annee, mois, jour] = date.split('-')
  return annee && mois && jour ? `${jour}/${mois}/${annee}` : date
}

function Repere({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{libelle}</dt>
      <dd className="text-sm">{valeur}</dd>
    </div>
  )
}

/** Une carte par cours suivi. */
function CarteProgression({ cours, progression }: ProgressionCours) {
  const {
    nbSeancesFaites,
    nbNouvelles,
    nbRevisions,
    nbLectures,
    derniereSeance,
    dernierePositionTravaillee,
    derniereNouvelleMemorisation,
    dernierExerciceDonne,
    miseEnAvant,
  } = progression

  // Le repère de mémorisation n'est répété que s'il diffère du dernier travail.
  const memorisationDistincte =
    derniereNouvelleMemorisation !== null &&
    derniereNouvelleMemorisation.date !== dernierePositionTravaillee?.date

  return (
    <li className="space-y-3 rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{cours.libelle}</p>
          {cours.type_libelle && (
            <p className="truncate text-xs text-muted-foreground">{cours.type_libelle}</p>
          )}
        </div>
        <Badge variant="outline" className="shrink-0">
          {nbSeancesFaites} {nbSeancesFaites > 1 ? 'séances' : 'séance'}
        </Badge>
      </div>

      {nbSeancesFaites === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune séance faite pour ce cours.</p>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-2">
            {miseEnAvant === 'position' ? (
              <>
                <Repere
                  libelle="Dernier passage travaillé"
                  valeur={
                    dernierePositionTravaillee
                      ? `${formaterPosition(dernierePositionTravaillee)} · ${formaterDate(dernierePositionTravaillee.date)}`
                      : 'Non renseigné'
                  }
                />
                {memorisationDistincte && derniereNouvelleMemorisation && (
                  <Repere
                    libelle="Dernière nouvelle mémorisation"
                    valeur={`${formaterPosition(derniereNouvelleMemorisation)} · ${formaterDate(derniereNouvelleMemorisation.date)}`}
                  />
                )}
              </>
            ) : (
              <Repere
                libelle="Dernier contenu abordé"
                valeur={
                  derniereSeance?.contenu_aborde
                    ? `${derniereSeance.contenu_aborde} · ${formaterDate(derniereSeance.date)}`
                    : 'Non renseigné'
                }
              />
            )}

            {dernierExerciceDonne && (
              <Repere
                libelle="Dernier exercice donné"
                valeur={`${dernierExerciceDonne.exercices} · ${formaterDate(dernierExerciceDonne.date)}`}
              />
            )}
          </dl>

          {(nbNouvelles > 0 || nbRevisions > 0 || nbLectures > 0) && (
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {nbNouvelles > 0 && <span>{nbNouvelles} nouvelle(s) mémorisation(s)</span>}
              {nbRevisions > 0 && <span>{nbRevisions} révision(s)</span>}
              {nbLectures > 0 && <span>{nbLectures} lecture(s)</span>}
            </div>
          )}
        </>
      )}
    </li>
  )
}

/**
 * Suivi pédagogique cumulé (CLAUDE.md §6) : où en est l'apprenant dans chacun
 * de ses cours, et ce qui lui a été donné à faire.
 */
export function SectionProgression({ apprenantId }: { apprenantId: string }) {
  const { progressions, seancesRecentes, isPending, isError, error } =
    useProgressionApprenant(apprenantId)

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <TrendingUp className="size-4 text-muted-foreground" aria-hidden="true" />
        Progression
      </h3>

      {isPending && (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Calcul de la progression…
        </p>
      )}

      {isError && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertDescription>{error?.message}</AlertDescription>
        </Alert>
      )}

      {!isPending && !isError && progressions.length === 0 && (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Inscrivez cet apprenant à un cours pour suivre sa progression.
        </p>
      )}

      {progressions.length > 0 && (
        <ul className="space-y-3">
          {progressions.map((entree) => (
            <CarteProgression key={entree.cours.id} {...entree} />
          ))}
        </ul>
      )}

      {seancesRecentes.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-2 text-xs font-medium">
            <NotebookPen className="size-3.5 text-muted-foreground" aria-hidden="true" />
            Dernières séances
          </h4>

          <ol className="space-y-3 border-l border-border pl-4">
            {seancesRecentes.slice(0, 8).map(({ seance, cours_libelle }) => (
              <li key={seance.id} className="relative">
                <span
                  className="absolute top-1.5 -left-[1.30rem] size-1.5 rounded-full bg-border"
                  aria-hidden="true"
                />
                <p className="text-xs font-medium">
                  {formaterDate(seance.date)}
                  <span className="font-normal text-muted-foreground"> · {cours_libelle}</span>
                </p>
                {seance.contenu_aborde && (
                  <p className="text-xs text-muted-foreground">{seance.contenu_aborde}</p>
                )}
                {seance.exercices_a_faire && (
                  <p className="flex items-start gap-1 text-xs text-muted-foreground">
                    <BookOpen className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                    {seance.exercices_a_faire}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}
