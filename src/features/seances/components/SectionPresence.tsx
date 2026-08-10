import { Info, Loader2, TriangleAlert, Users } from 'lucide-react'

import { useInscriptionsCours } from '@/features/inscriptions/hooks/useInscriptionsCours'
import { useParametres } from '@/features/parametres/hooks/useParametres'
import { LigneEvaluation } from '@/features/seances/components/LigneEvaluation'
import { useDefinirPresence } from '@/features/seances/hooks/useDefinirPresence'
import { usePresences } from '@/features/seances/hooks/usePresences'
import { BAREME_PAR_DEFAUT } from '@/shared/supabase/parametresRepo'
import { Alert, AlertDescription } from '@/shared/ui/alert'

export interface SectionPresenceProps {
  coursId: string
  /** `undefined` tant que la séance n'a pas été enregistrée. */
  seanceId: string | undefined
  /** Exercices donnés la dernière fois : suggestion de passage à évaluer. */
  passageSuggere?: string | null
}

/**
 * Présence et évaluation des apprenants inscrits à un cours — **quel que soit
 * son format**. Un cours individuel affiche une ligne, un groupe en affiche N :
 * c'est le nombre d'inscrits qui décide, pas le format déclaré.
 *
 * Une présence est rattachée à une séance par clé étrangère : tant que la
 * séance n'existe pas, il n'y a rien à quoi l'accrocher. Les cases sont donc
 * affichées mais inactives, avec l'explication — plutôt que masquées, pour que
 * l'enseignant sache que la fonction existe.
 */
export function SectionPresence({
  coursId,
  seanceId,
  passageSuggere = null,
}: SectionPresenceProps) {
  const { data: inscriptions, isPending: chargementInscrits } = useInscriptionsCours(coursId)
  const { data: presences } = usePresences(seanceId)
  const { data: parametres } = useParametres()
  const definir = useDefinirPresence()

  const bareme = parametres?.note_bareme ?? BAREME_PAR_DEFAUT

  const inscrits = inscriptions ?? []
  const parApprenant = new Map(
    (presences ?? []).map((presence) => [presence.apprenant_id, presence])
  )

  const seanceEnregistree = Boolean(seanceId)

  function basculer(apprenantId: string, present: boolean) {
    if (!seanceId) return
    definir.mutate({ seanceId, apprenantId, present })
  }

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Users className="size-4 text-muted-foreground" aria-hidden="true" />
        Présence et évaluation
        {inscrits.length > 0 && (
          <span className="font-normal text-muted-foreground">({inscrits.length})</span>
        )}
      </h3>

      {!seanceEnregistree && (
        <Alert>
          <Info className="size-4" aria-hidden="true" />
          <AlertDescription>Enregistrez la séance pour noter les présences.</AlertDescription>
        </Alert>
      )}

      {definir.isError && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertDescription>{definir.error.message}</AlertDescription>
        </Alert>
      )}

      {chargementInscrits && (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Chargement des apprenants…
        </p>
      )}

      {/* Une note sans apprenant n'a pas de sens : on dit quoi faire plutôt que
          de laisser un constat sec. */}
      {!chargementInscrits && inscrits.length === 0 && (
        <p className="rounded-lg border border-dashed px-4 py-4 text-center text-sm text-muted-foreground">
          Aucun apprenant inscrit à ce cours. Inscrivez-en un depuis le détail du cours pour
          noter sa présence et sa récitation.
        </p>
      )}

      {inscrits.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {inscrits.map((inscription) => {
            const evaluation = parApprenant.get(inscription.apprenant_id) ?? null
            // Absent de la table = présent par défaut, comme la colonne en base.
            const present = evaluation?.present ?? true
            const nomComplet = [inscription.apprenant?.prenom, inscription.apprenant?.nom]
              .filter(Boolean)
              .join(' ')

            return (
              <LigneEvaluation
                key={inscription.id}
                seanceId={seanceId}
                apprenantId={inscription.apprenant_id}
                nomComplet={nomComplet}
                present={present}
                onBasculerPresence={(coche) => basculer(inscription.apprenant_id, coche)}
                presenceEnCours={definir.isPending}
                evaluation={evaluation}
                bareme={bareme}
                passageSuggere={passageSuggere}
              />
            )
          })}
        </ul>
      )}
    </section>
  )
}
