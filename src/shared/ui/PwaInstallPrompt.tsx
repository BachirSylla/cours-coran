import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

import { Button } from '@/shared/ui/button'

/** Événement non standard, encore absent des types DOM. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  prompt: () => Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Bannière « Installer l'application » (PWA, ajout à l'écran d'accueil).
 * Le navigateur n'émet `beforeinstallprompt` que si l'app est installable
 * et pas déjà installée — la bannière reste donc invisible le reste du temps.
 */
export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      // Empêche la mini-infobar de Chrome : on propose l'installation nous-mêmes.
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }

    function onInstalled() {
      setInstallEvent(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!installEvent) return null

  async function handleInstall() {
    if (!installEvent) return
    await installEvent.prompt()
    await installEvent.userChoice
    // L'événement n'est utilisable qu'une fois.
    setInstallEvent(null)
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md sm:inset-x-auto sm:right-6 sm:bottom-6">
      <div className="flex items-center gap-3 rounded-xl border bg-card p-3 text-card-foreground shadow-lg">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Download className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Installer l'application</p>
          <p className="text-xs text-muted-foreground">
            Accès rapide depuis l'écran d'accueil, même hors ligne.
          </p>
        </div>
        <Button size="sm" onClick={() => void handleInstall()}>
          Installer
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => setInstallEvent(null)}
          aria-label="Masquer la proposition d'installation"
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
