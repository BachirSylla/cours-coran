import { CalendarRange } from 'lucide-react'

import { useSessionActive } from '@/features/sessions/hooks/useSessions'
import { SelectNatif } from '@/shared/ui/SelectNatif'

/**
 * Le sélecteur de session, dans l'en-tête.
 *
 * ⚠️ **Zéro friction pour un centre qui n'utilise pas les sessions.** Le
 * backfill de 0022 lui en a posé une, perpétuelle, et il n'en aura jamais
 * d'autre : dans ce cas le composant affiche un simple libellé — pas une liste
 * déroulante à un seul choix, qui donnerait l'impression d'un réglage à faire.
 *
 * Une session clôturée reste sélectionnable : on consulte, on imprime un
 * rapport, on relit une progression. C'est la saisie qui se ferme, pas la
 * lecture.
 */
export function SelecteurSession() {
  const { session, sessions, plusieurs, choisir, chargement } = useSessionActive()

  if (chargement || !session) return null

  if (!plusieurs) {
    return (
      <span
        className="flex items-center gap-1.5 text-xs text-muted-foreground"
        title={`Session : ${session.nom}`}
      >
        <CalendarRange className="size-3.5" aria-hidden="true" />
        <span className="max-w-32 truncate sm:max-w-none">{session.nom}</span>
      </span>
    )
  }

  return (
    <SelectNatif
      value={session.id}
      onChange={(evenement) => choisir(evenement.currentTarget.value)}
      aria-label="Session affichée"
      className="h-8 max-w-40 px-2 text-xs sm:max-w-56"
    >
      {sessions.map((candidate) => (
        <option key={candidate.id} value={candidate.id}>
          {candidate.nom}
          {candidate.statut === 'terminee' ? ' (terminée)' : ''}
        </option>
      ))}
    </SelectNatif>
  )
}
