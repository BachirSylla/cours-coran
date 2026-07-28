import { useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'

import { Button } from '@/shared/ui/button'

/**
 * Lien de visioconférence du cours — un seul par cours, réutilisé par toutes
 * ses séances (CLAUDE.md §5.4).
 */
export function LienMeet({ lien }: { lien: string | null }) {
  const [copie, setCopie] = useState(false)

  if (!lien) {
    return <span className="text-sm text-muted-foreground">—</span>
  }

  async function copier() {
    if (!lien) return
    await navigator.clipboard.writeText(lien)
    setCopie(true)
    window.setTimeout(() => setCopie(false), 2000)
  }

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon-sm" asChild aria-label="Ouvrir le lien du cours">
        <a href={lien} target="_blank" rel="noopener noreferrer" title={lien}>
          <ExternalLink className="size-4" aria-hidden="true" />
        </a>
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => void copier()}
        aria-label={copie ? 'Lien copié' : 'Copier le lien'}
        title={copie ? 'Lien copié' : 'Copier le lien'}
      >
        {copie ? (
          <Check className="size-4 text-primary" aria-hidden="true" />
        ) : (
          <Copy className="size-4" aria-hidden="true" />
        )}
      </Button>
    </div>
  )
}
