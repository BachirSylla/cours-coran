import { Link } from 'react-router'

import { Button } from '@/shared/ui/button'

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <p className="text-sm font-medium text-muted-foreground">Erreur 404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Page introuvable</h1>
      <p className="text-sm text-muted-foreground">
        Cette adresse ne correspond à aucun écran de l'application.
      </p>
      <Button asChild>
        <Link to="/">Retour à l'accueil</Link>
      </Button>
    </div>
  )
}
