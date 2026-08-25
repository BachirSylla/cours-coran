import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { GraduationCap, Info, Loader2, TriangleAlert } from 'lucide-react'

import {
  creerExamenSchema,
  valeurParDefaut,
  type ExamenFormValues,
  type ExamenValues,
} from '@/features/inscriptions/examenSchema'
import { useInscriptionsCours } from '@/features/inscriptions/hooks/useInscriptionsCours'
import { useNoterExamen } from '@/features/inscriptions/hooks/useNoterExamen'
import { useParametres } from '@/features/parametres/hooks/useParametres'
import { BAREMES, estBaremeConnu, type Bareme } from '@/shared/lib/evaluations'
import type { InscriptionAvecApprenant } from '@/shared/supabase/inscriptionRepo'
import { BAREME_PAR_DEFAUT } from '@/shared/supabase/parametresRepo'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { SelectNatif } from '@/shared/ui/SelectNatif'

export interface SectionExamenProps {
  coursId: string
}

/**
 * Note d'examen de fin de session, un apprenant à la fois.
 *
 * Elle vit sur l'inscription : c'est la note de **cet** apprenant pour **ce**
 * cours. Corollaire visible plus bas dans la fiche : le retirer du cours
 * supprime sa note.
 */
export function SectionExamen({ coursId }: SectionExamenProps) {
  const { data: inscriptions, isPending } = useInscriptionsCours(coursId)
  const { data: parametres } = useParametres()

  const inscrits = inscriptions ?? []
  const baremeDuCompte = parametres?.note_bareme ?? BAREME_PAR_DEFAUT

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <GraduationCap className="size-4 text-muted-foreground" aria-hidden="true" />
        Examen de fin de session
      </h3>

      {isPending && (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Chargement des apprenants…
        </p>
      )}

      {!isPending && inscrits.length === 0 && (
        <p className="rounded-lg border border-dashed px-4 py-4 text-center text-sm text-muted-foreground">
          Aucun apprenant inscrit à ce cours. Inscrivez-en un depuis le détail du cours pour
          noter son examen.
        </p>
      )}

      {inscrits.length > 0 && (
        <>
          <ul className="divide-y rounded-lg border">
            {inscrits.map((inscription) => (
              <LigneExamen
                key={inscription.id}
                inscription={inscription}
                coursId={coursId}
                baremeDuCompte={baremeDuCompte}
              />
            ))}
          </ul>

          <Alert>
            <Info className="size-4" aria-hidden="true" />
            <AlertDescription>
              Cette note compte pour la part académique de la note finale. Laissez le champ vide
              tant que l'examen n'a pas eu lieu.
            </AlertDescription>
          </Alert>
        </>
      )}
    </section>
  )
}

function LigneExamen({
  inscription,
  coursId,
  baremeDuCompte,
}: {
  inscription: InscriptionAvecApprenant
  coursId: string
  baremeDuCompte: number
}) {
  const noter = useNoterExamen()

  // Le barème déjà figé avec la note fait foi ; sinon, celui du compte sert de
  // proposition — l'enseignant note rarement sur deux échelles différentes.
  const baremeEnregistre = inscription.examen_bareme
  const [bareme, setBareme] = useState<Bareme>(
    baremeEnregistre !== null && estBaremeConnu(baremeEnregistre)
      ? baremeEnregistre
      : estBaremeConnu(baremeDuCompte)
        ? baremeDuCompte
        : 20
  )

  const nomComplet = [inscription.apprenant?.prenom, inscription.apprenant?.nom]
    .filter(Boolean)
    .join(' ')

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ExamenFormValues, unknown, ExamenValues>({
    resolver: zodResolver(creerExamenSchema(bareme)),
    defaultValues: valeurParDefaut(inscription.note_examen),
  })

  async function onSubmit(valeurs: ExamenValues) {
    await noter.mutateAsync({
      inscriptionId: inscription.id,
      apprenantId: inscription.apprenant_id,
      coursId,
      examen: {
        note_examen: valeurs.note,
        // Le barème est figé avec la note : changer de réglage plus tard ne
        // réinterprétera pas cet examen. Effacer la note efface les deux.
        examen_bareme: valeurs.note === null ? null : bareme,
      },
    })
  }

  return (
    <li className="space-y-2 px-3 py-2">
      <form
        onSubmit={(evenement) => void handleSubmit(onSubmit)(evenement)}
        className="flex flex-wrap items-center gap-2"
      >
        <span className="min-w-32 flex-1 truncate text-sm font-medium">{nomComplet}</span>

        <div className="w-20">
          <Label htmlFor={`examen-${inscription.id}`} className="sr-only">
            Note d'examen de {nomComplet}
          </Label>
          <Input
            id={`examen-${inscription.id}`}
            inputMode="decimal"
            placeholder="Note"
            aria-invalid={Boolean(errors.note)}
            {...register('note')}
          />
        </div>

        <div>
          <Label htmlFor={`bareme-${inscription.id}`} className="sr-only">
            Barème de l'examen de {nomComplet}
          </Label>
          <SelectNatif
            id={`bareme-${inscription.id}`}
            value={bareme}
            onChange={(evenement) => setBareme(Number(evenement.currentTarget.value) as Bareme)}
            className="px-2"
          >
            {BAREMES.map((valeur) => (
              <option key={valeur} value={valeur}>
                /{valeur}
              </option>
            ))}
          </SelectNatif>
        </div>

        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={!isDirty || noter.isPending}
        >
          {noter.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Enregistrer
        </Button>
      </form>

      {errors.note && <p className="text-sm text-destructive">{errors.note.message}</p>}

      {noter.isError && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertDescription>{noter.error.message}</AlertDescription>
        </Alert>
      )}

      {noter.isSuccess && !isDirty && (
        <p className="text-xs text-muted-foreground">Note enregistrée.</p>
      )}
    </li>
  )
}
