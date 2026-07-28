import { Info, Loader2, TriangleAlert, Users } from 'lucide-react'

import { useInscriptionsCours } from '@/features/inscriptions/hooks/useInscriptionsCours'
import { useDefinirPresence } from '@/features/seances/hooks/useDefinirPresence'
import { usePresences } from '@/features/seances/hooks/usePresences'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Checkbox } from '@/shared/ui/checkbox'
import { Label } from '@/shared/ui/label'

export interface SectionPresenceProps {
  coursId: string
  /** `undefined` tant que la séance n'a pas été enregistrée. */
  seanceId: string | undefined
}

/**
 * Présence des apprenants inscrits à un cours de groupe.
 *
 * Une présence est rattachée à une séance par clé étrangère : tant que la
 * séance n'existe pas, il n'y a rien à quoi l'accrocher. Les cases sont donc
 * affichées mais inactives, avec l'explication — plutôt que masquées, pour que
 * l'enseignant sache que la fonction existe.
 */
export function SectionPresence({ coursId, seanceId }: SectionPresenceProps) {
  const { data: inscriptions, isPending: chargementInscrits } = useInscriptionsCours(coursId)
  const { data: presences } = usePresences(seanceId)
  const definir = useDefinirPresence()

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
        Présence
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

      {!chargementInscrits && inscrits.length === 0 && (
        <p className="rounded-lg border border-dashed px-4 py-4 text-center text-sm text-muted-foreground">
          Aucun apprenant inscrit à ce cours.
        </p>
      )}

      {inscrits.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {inscrits.map((inscription) => {
            const identifiant = `presence-${inscription.apprenant_id}`
            // Absent de la table = présent par défaut, comme la colonne en base.
            const present = parApprenant.get(inscription.apprenant_id)?.present ?? true

            return (
              <li key={inscription.id} className="flex items-center gap-3 px-3 py-2">
                <Checkbox
                  id={identifiant}
                  checked={present}
                  disabled={!seanceEnregistree || definir.isPending}
                  onCheckedChange={(coche) =>
                    basculer(inscription.apprenant_id, coche === true)
                  }
                />
                <Label htmlFor={identifiant} className="flex-1 cursor-pointer font-normal">
                  {inscription.apprenant?.prenom} {inscription.apprenant?.nom}
                </Label>
                <span className="text-xs text-muted-foreground">
                  {present ? 'Présent' : 'Absent'}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
