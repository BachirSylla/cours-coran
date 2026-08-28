import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { BookOpen, Check, Loader2, LogOut, TriangleAlert } from 'lucide-react'

import { useAuth } from '@/features/auth/useAuth'
import { useRacheterInvitation } from '@/features/membres/hooks/useRacheterInvitation'
import { rachatSchema, type RachatFormValues } from '@/features/membres/rachatSchema'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'

/**
 * Écran d'accueil d'un compte **inerte** : connecté, mais rattaché à aucun
 * centre. Rendu par `RequireMembre` à la place de l'application.
 *
 * Le bouton de déconnexion n'est pas décoratif : se tromper de compte ne doit
 * pas enfermer quelqu'un sur un écran sans issue.
 */
export function RejoindreCentrePage() {
  const { user, signOut } = useAuth()
  const racheter = useRacheterInvitation()
  const [centreRejoint, setCentreRejoint] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RachatFormValues>({
    resolver: zodResolver(rachatSchema),
    defaultValues: { code: '', nomAffiche: '' },
  })

  async function onSubmit(valeurs: RachatFormValues) {
    const centre = await racheter.mutateAsync({
      code: valeurs.code,
      nomAffiche: valeurs.nomAffiche,
    })
    setCentreRejoint(centre)
  }

  // Le rachat a réussi : l'invalidation du cache va faire réapparaître
  // l'application dès que `useMembre()` aura la nouvelle appartenance. On
  // annonce l'entrée plutôt que de laisser un écran vide pendant ce temps.
  if (centreRejoint !== null) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <span className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Check className="size-5" aria-hidden="true" />
            </span>
            <CardTitle className="text-xl">Bienvenue</CardTitle>
            <CardDescription>
              Vous avez rejoint {centreRejoint} en tant qu'enseignant.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Ouverture de votre espace…
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <span className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookOpen className="size-5" aria-hidden="true" />
          </span>
          <CardTitle className="text-xl">Rejoindre un centre</CardTitle>
          <CardDescription>
            Votre compte n'est rattaché à aucun centre. Saisissez le code que son responsable
            vous a transmis.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={(evenement) => void handleSubmit(onSubmit)(evenement)}
            className="space-y-4"
            noValidate
          >
            {racheter.isError && (
              <Alert variant="destructive">
                <TriangleAlert className="size-4" aria-hidden="true" />
                <AlertDescription>{racheter.error.message}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="code">Code d'invitation</Label>
              <Input
                id="code"
                autoFocus
                autoCapitalize="characters"
                placeholder="XXXX-XXXX-XXXX"
                className="font-mono tracking-widest"
                aria-invalid={Boolean(errors.code)}
                {...register('code')}
              />
              {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="nomAffiche">Votre nom</Label>
              <Input
                id="nomAffiche"
                autoComplete="name"
                placeholder="Amina Diallo"
                aria-invalid={Boolean(errors.nomAffiche)}
                {...register('nomAffiche')}
              />
              <p className="text-xs text-muted-foreground">
                C'est ainsi que vos collègues vous verront.
              </p>
              {errors.nomAffiche && (
                <p className="text-sm text-destructive">{errors.nomAffiche.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={racheter.isPending}>
              {racheter.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              {racheter.isPending ? 'Vérification…' : 'Rejoindre'}
            </Button>
          </form>

          <div className="mt-6 border-t pt-4 text-center">
            <p className="mb-2 text-xs text-muted-foreground">
              Connecté en tant que {user?.email}
            </p>
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut className="size-4" aria-hidden="true" />
              Se déconnecter
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
