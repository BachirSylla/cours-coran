import { Check, Info, Loader2, TriangleAlert } from 'lucide-react'

import { useEnregistrerBareme } from '@/features/parametres/hooks/useEnregistrerBareme'
import { useParametres } from '@/features/parametres/hooks/useParametres'
import { BAREMES, type Bareme } from '@/shared/lib/evaluations'
import { cn } from '@/shared/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert'
import { BAREME_PAR_DEFAUT } from '@/shared/supabase/parametresRepo'

export function ParametresPage() {
  const { data: parametres, isPending, isError, error } = useParametres()
  const enregistrer = useEnregistrerBareme()

  const bareme = parametres?.note_bareme ?? BAREME_PAR_DEFAUT
  const enregistres = parametres?.enregistres ?? false

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
        <p className="text-sm text-muted-foreground">Réglages de votre compte enseignant.</p>
      </div>

      {isPending && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Chargement des paramètres…
        </div>
      )}

      {isError && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertTitle>Chargement impossible</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {!isPending && !isError && (
        <section className="space-y-4 rounded-lg border bg-card p-4">
          <div>
            <h2 className="text-sm font-medium">Barème de notation</h2>
            <p className="text-sm text-muted-foreground">
              Utilisé pour évaluer la récitation lors de la saisie d'une séance.
              {!enregistres && (
                <span className="text-foreground"> Actuellement : valeur par défaut (20).</span>
              )}
            </p>
          </div>

          <div role="radiogroup" aria-label="Barème de notation" className="flex gap-3">
            {BAREMES.map((valeur) => {
              const actif = valeur === bareme

              return (
                <button
                  key={valeur}
                  type="button"
                  role="radio"
                  aria-checked={actif}
                  disabled={enregistrer.isPending}
                  onClick={() => enregistrer.mutate(valeur as Bareme)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors sm:flex-none sm:px-8',
                    actif
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {actif && <Check className="size-4" aria-hidden="true" />}
                  Sur {valeur}
                </button>
              )
            })}
          </div>

          {enregistrer.isPending && (
            <p
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              Enregistrement…
            </p>
          )}

          {enregistrer.isError && (
            <Alert variant="destructive">
              <TriangleAlert className="size-4" aria-hidden="true" />
              <AlertDescription>{enregistrer.error.message}</AlertDescription>
            </Alert>
          )}

          {/* Changer de barème inquiète si l'on ne dit pas ce qu'il advient de
              l'existant : chaque note conserve le sien (migration 0006). */}
          <Alert>
            <Info className="size-4" aria-hidden="true" />
            <AlertDescription>
              Les notes déjà enregistrées gardent le barème sous lequel elles ont été données.
              Ce réglage ne s'applique qu'aux prochaines évaluations.
            </AlertDescription>
          </Alert>
        </section>
      )}
    </div>
  )
}
