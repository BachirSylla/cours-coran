import { useState } from 'react'
import { Info, Loader2, TriangleAlert, UserMinus, UserRoundPlus, Users } from 'lucide-react'

import { StatutApprenantBadge } from '@/features/apprenants/components/StatutApprenantBadge'
import { useApprenants } from '@/features/apprenants/hooks/useApprenants'
import { SelecteurApprenant } from '@/features/inscriptions/components/SelecteurApprenant'
import { useAjouterInscription } from '@/features/inscriptions/hooks/useAjouterInscription'
import {
  useInscriptionsCours,
  useInscriptionsSessionPrecedente,
} from '@/features/inscriptions/hooks/useInscriptionsCours'
import { useRetirerInscription } from '@/features/inscriptions/hooks/useRetirerInscription'
import { messageRefus, peutAjouterInscription } from '@/features/inscriptions/reglesInscription'
import { useReglementsInscription } from '@/features/paiements/hooks/useReglementsInscription'
import { formaterMontant } from '@/shared/lib/paiements'
import { formaterNote } from '@/shared/lib/evaluations'
import type { InscriptionAvecApprenant } from '@/shared/supabase/inscriptionRepo'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { Button } from '@/shared/ui/button'

export interface SectionInscriptionsProps {
  coursId: string
  /**
   * Cours dont celui-ci est la copie (migration 0024). Quand il existe, la
   * section propose ses anciens inscrits — une aide à la saisie, jamais une
   * recopie : la reconduction ne reprend délibérément aucune inscription.
   */
  reconduitDe?: string | null
  /** `individuel` ou `groupe` : pilote la règle de capacité (CLAUDE.md §5.7). */
  format: string
  /**
   * Un enseignant consulte la composition de sa classe sans la modifier : la
   * table `inscription` est une table de gestion (migration 0012).
   */
  lectureSeule?: boolean
}

export function SectionInscriptions({
  coursId,
  format,
  reconduitDe = null,
  lectureSeule = false,
}: SectionInscriptionsProps) {
  const { data: inscriptions, isPending, isError, error } = useInscriptionsCours(coursId)
  const { data: tousLesApprenants } = useApprenants()

  const ajouter = useAjouterInscription()
  const retirer = useRetirerInscription()

  const [aRetirer, setARetirer] = useState<InscriptionAvecApprenant | null>(null)
  const [dejaReplaces, setDejaReplaces] = useState<ReadonlySet<string>>(new Set())

  const liste = inscriptions ?? []
  const idsInscrits = new Set(liste.map((inscription) => inscription.apprenant_id))
  const disponibles = (tousLesApprenants ?? []).filter(
    (apprenant) => !idsInscrits.has(apprenant.id)
  )

  const verdict = peutAjouterInscription(format, liste.length)

  /*
   * Les inscrits de la session précédente qui ne le sont pas encore ici.
   *
   * ⚠️ Proposés, jamais replacés d'office. Une promotion de Niveau 1 à Niveau 2
   * est une décision pédagogique, et tout le monde ne se réinscrit pas. Le
   * bouton fait gagner les clics, il ne décide rien.
   */
  const { data: precedents } = useInscriptionsSessionPrecedente(
    lectureSeule ? null : reconduitDe
  )

  /*
   * Le garde porte ICI, pas seulement sur le `enabled` du hook : un composant
   * qui s'en remet à sa requête pour savoir quoi afficher devient faux dès que
   * le cache lui rend d'anciennes données.
   */
  /*
   * ⚠️ `idsInscrits` vient du cache, qui ne se rafraîchit qu'après invalidation.
   * Entre le clic et le refetch, la personne resterait proposée — et sur un
   * cours individuel, un second clic passerait la règle de capacité (§5.7), qui
   * est applicative et n'a aucun filet en base. On retient donc localement qui a
   * déjà été replacé.
   */
  const aReplacer = reconduitDe
    ? (precedents ?? []).filter(
        (ancienne) =>
          !idsInscrits.has(ancienne.apprenant_id) &&
          !dejaReplaces.has(ancienne.apprenant_id) &&
          ancienne.apprenant !== null
      )
    : []

  /*
   * ⚠️ Ce que la désinscription va DÉTRUIRE. `reglement` cascade depuis
   * `inscription` (0026) : retirer un apprenant emporte tout ce qu'il a versé.
   * C'est de l'argent encaissé, et la migration pose que l'écran doit l'annoncer
   * avant — sur le modèle de « Retirer les pointages » (0020).
   */
  const { data: reglements } = useReglementsInscription(aRetirer?.id ?? null)
  const encaisse = (reglements ?? []).reduce(
    (total, reglement) => total + reglement.montant_recu,
    0
  )
  const nbReglements = (reglements ?? []).length

  const noteExamen =
    aRetirer?.note_examen !== null &&
    aRetirer?.note_examen !== undefined &&
    aRetirer.examen_bareme !== null
      ? formaterNote(aRetirer.note_examen, aRetirer.examen_bareme)
      : null

  function inscrire(apprenantId: string) {
    ajouter.mutate({ apprenantId, coursId })
  }

  function confirmerRetrait() {
    if (!aRetirer) return
    retirer.mutate(
      {
        inscriptionId: aRetirer.id,
        apprenantId: aRetirer.apprenant_id,
        coursId,
      },
      { onSuccess: () => setARetirer(null) }
    )
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Users className="size-4 text-muted-foreground" aria-hidden="true" />
          Apprenants
          {liste.length > 0 && (
            <span className="font-normal text-muted-foreground">({liste.length})</span>
          )}
        </h3>

        {/* Inscrire et désinscrire relèvent de la gestion : un enseignant voit
            la liste de sa classe, il ne la compose pas (migration 0012). */}
        {!lectureSeule && (
          <SelecteurApprenant
            apprenants={disponibles}
            onChoisir={inscrire}
            desactive={!verdict.autorise}
            enCours={ajouter.isPending}
          />
        )}
      </div>

      {/* Ce que la reconduction n'a délibérément pas fait, proposé en un clic. */}
      {!lectureSeule && aReplacer.length > 0 && verdict.autorise && (
        <Alert>
          <UserRoundPlus className="size-4" aria-hidden="true" />
          <AlertDescription className="space-y-2">
            <span className="block">
              {/* Une phrase d'un seul tenant : un texte découpé en plusieurs
                  nœuds ne se retrouve ni par un lecteur d'écran, ni par un
                  test. */}
              {aReplacer.length > 1
                ? `${aReplacer.length} apprenants étaient inscrits à ce cours la session précédente.`
                : '1 apprenant était inscrit à ce cours la session précédente.'}
            </span>
            <span className="block text-xs">
              {aReplacer
                .map((ancienne) =>
                  [ancienne.apprenant?.prenom, ancienne.apprenant?.nom]
                    .filter(Boolean)
                    .join(' ')
                )
                .join(', ')}
            </span>
            <div className="flex flex-wrap gap-2">
              {aReplacer.map((ancienne) => (
                <Button
                  key={ancienne.id}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDejaReplaces((precedent) =>
                      new Set(precedent).add(ancienne.apprenant_id)
                    )
                    inscrire(ancienne.apprenant_id)
                  }}
                  disabled={ajouter.isPending || !verdict.autorise}
                >
                  <UserRoundPlus className="size-4" aria-hidden="true" />
                  {[ancienne.apprenant?.prenom, ancienne.apprenant?.nom]
                    .filter(Boolean)
                    .join(' ')}
                </Button>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Le bouton désactivé ne doit pas rester muet : on dit pourquoi. */}
      {!lectureSeule && !verdict.autorise && verdict.raison && (
        <Alert>
          <Info className="size-4" aria-hidden="true" />
          <AlertDescription>{messageRefus(verdict.raison)}</AlertDescription>
        </Alert>
      )}

      {(ajouter.isError || retirer.isError) && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertDescription>
            {ajouter.error?.message ?? retirer.error?.message}
          </AlertDescription>
        </Alert>
      )}

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

      {isError && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {!isPending && !isError && liste.length === 0 && (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Aucun apprenant inscrit à ce cours.
        </p>
      )}

      {liste.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {liste.map((inscription) => (
            <li key={inscription.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {inscription.apprenant?.prenom} {inscription.apprenant?.nom}
                </p>
                {inscription.apprenant?.contact && (
                  <p className="truncate text-xs text-muted-foreground">
                    {inscription.apprenant.contact}
                  </p>
                )}
              </div>

              {inscription.apprenant && (
                <StatutApprenantBadge statut={inscription.apprenant.statut} />
              )}

              {!lectureSeule && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setARetirer(inscription)}
                  aria-label={`Retirer ${inscription.apprenant?.prenom} ${inscription.apprenant?.nom} du cours`}
                >
                  <UserMinus className="size-4 text-destructive" aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <AlertDialog
        open={Boolean(aRetirer)}
        onOpenChange={(ouvert) => {
          if (!ouvert) setARetirer(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer cet apprenant du cours ?</AlertDialogTitle>
            <AlertDialogDescription>
              {aRetirer
                ? `${aRetirer.apprenant?.prenom} ${aRetirer.apprenant?.nom} ne suivra plus ce cours. Sa fiche apprenant est conservée.`
                : ''}
            </AlertDialogDescription>

            {/* La note d'examen vit sur l'inscription : elle part avec elle.
                On ne le dit que s'il y en a une — sinon c'est du bruit. */}
            {noteExamen && (
              <Alert variant="destructive">
                <TriangleAlert className="size-4" aria-hidden="true" />
                <AlertDescription>
                  Sa note d'examen ({noteExamen}) sera définitivement supprimée.
                </AlertDescription>
              </Alert>
            )}

            {/* Le suivi de règlement part aussi — et c'est de l'argent. On le
                dit avec le montant : « des règlements seront supprimés » ne
                laisse pas mesurer ce qu'on perd. */}
            {nbReglements > 0 && (
              <Alert variant="destructive">
                <TriangleAlert className="size-4" aria-hidden="true" />
                <AlertDescription>
                  {nbReglements === 1
                    ? 'Son suivi de règlement sera définitivement supprimé'
                    : `Ses ${nbReglements} suivis de règlement seront définitivement supprimés`}
                  {encaisse > 0
                    ? `, dont ${formaterMontant(encaisse, 'XOF')} déjà encaissés.`
                    : '.'}{' '}
                  Cette recette disparaîtra des totaux.
                </AlertDescription>
              </Alert>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={retirer.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(evenement) => {
                evenement.preventDefault()
                confirmerRetrait()
              }}
              disabled={retirer.isPending}
            >
              {retirer.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
