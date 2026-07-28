import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Navigate, useLocation } from 'react-router'
import { BookOpen, Loader2, TriangleAlert } from 'lucide-react'

import { useAuth } from '@/features/auth/useAuth'
import { loginSchema, type LoginFormValues } from '@/features/auth/loginSchema'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'

/** Destination mémorisée par `RequireAuth` avant la redirection. */
interface EtatRedirection {
  from?: { pathname?: string }
}

export function LoginPage() {
  const { statut, signIn } = useAuth()
  const location = useLocation()
  const [erreur, setErreur] = useState<string | null>(null)

  const destination = (location.state as EtatRedirection | null)?.from?.pathname ?? '/'

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', motDePasse: '' },
  })

  // Session déjà ouverte (retour sur /login, ou connexion dans un autre onglet).
  if (statut === 'connecte') {
    return <Navigate to={destination} replace />
  }

  async function onSubmit(valeurs: LoginFormValues) {
    setErreur(null)
    try {
      await signIn(valeurs.email, valeurs.motDePasse)
      // La redirection est prise en charge par le rendu ci-dessus, dès que le
      // statut passe à « connecte ».
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : 'Connexion impossible.')
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <span className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookOpen className="size-5" aria-hidden="true" />
          </span>
          <CardTitle className="text-xl">Cours Coran</CardTitle>
          <CardDescription>Connectez-vous pour accéder à votre planning.</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {erreur && (
              <Alert variant="destructive">
                <TriangleAlert className="size-4" aria-hidden="true" />
                <AlertDescription>{erreur}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Adresse e-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="enseignant@exemple.com"
                aria-invalid={Boolean(errors.email)}
                {...register('email')}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="motDePasse">Mot de passe</Label>
              <Input
                id="motDePasse"
                type="password"
                autoComplete="current-password"
                aria-invalid={Boolean(errors.motDePasse)}
                {...register('motDePasse')}
              />
              {errors.motDePasse && (
                <p className="text-sm text-destructive">{errors.motDePasse.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {isSubmitting ? 'Connexion…' : 'Se connecter'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
