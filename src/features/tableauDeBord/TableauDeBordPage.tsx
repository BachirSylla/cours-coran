import {
  BookOpen,
  CalendarClock,
  GraduationCap,
  Loader2,
  PenLine,
  TrendingUp,
  TriangleAlert,
  UserRoundCheck,
  Users,
  Wallet,
} from 'lucide-react'

import { CoursDuJourListe } from '@/features/tableauDeBord/components/CoursDuJourListe'
import { GrapheEncaissements } from '@/features/tableauDeBord/components/GrapheEncaissements'
import { Jauge } from '@/features/tableauDeBord/components/Jauge'
import { ListeAlertes } from '@/features/tableauDeBord/components/ListeAlertes'
import { ListeImpayes } from '@/features/tableauDeBord/components/ListeImpayes'
import { ResumeEnseignants } from '@/features/tableauDeBord/components/ResumeEnseignants'
import { TuileChiffre } from '@/features/tableauDeBord/components/TuileChiffre'
import { useTableauDeBord } from '@/features/tableauDeBord/hooks/useTableauDeBord'
import { formaterMontant } from '@/shared/lib/paiements'
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert'

/**
 * L'accueil : l'état du centre d'un coup d'œil.
 *
 * Deux écrans en un, selon qui regarde. Le **responsable** voit d'abord
 * l'argent — c'est ce qu'on vient chercher — puis ce qui demande une action. Un
 * **enseignant** voit une version pédagogique : ses cours du jour, ses séances à
 * saisir, l'assiduité de ses groupes. Jamais les finances du centre.
 *
 * ⚠️ Ce n'est pas cette page qui protège l'argent : la RLS le fait
 * (`reglement` et `tarif` sont gardées `est_responsable()` en LECTURE). Le
 * partage d'écran évite de montrer des cartes vides qui se liraient comme une
 * panne — c'est de la lisibilité, pas une barrière.
 */
export function TableauDeBordPage() {
  const bord = useTableauDeBord()

  if (bord.isPending) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 rounded-xl border border-dashed py-24 text-sm text-muted-foreground"
      >
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Chargement du tableau de bord…
      </div>
    )
  }

  if (bord.isError) {
    return (
      <Alert variant="destructive">
        <TriangleAlert className="size-4" aria-hidden="true" />
        <AlertTitle>Chargement impossible</AlertTitle>
        <AlertDescription>{bord.error?.message}</AlertDescription>
      </Alert>
    )
  }

  const { argent, assiduite, pedagogie } = bord

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
        <p className="text-sm text-muted-foreground">
          {bord.session ? bord.session.nom : 'Aucune session'} · {bord.libellePeriode}
        </p>
      </header>

      {bord.alertes.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">À traiter</h2>
          <ListeAlertes alertes={bord.alertes} />
        </section>
      )}

      {/*
        Les chiffres-clés. Une seule tuile accentuée — « reste à encaisser » pour
        le responsable, « séances à noter » pour l'enseignant : ce qu'on doit
        aller chercher, pas ce qui est déjà fait.
      */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {bord.voitArgent && argent && (
          <>
            <TuileChiffre
              libelle="Reste à encaisser"
              valeur={formaterMontant(argent.reste, bord.devise)}
              detail={
                argent.enRetard === 0
                  ? 'Tout est réglé'
                  : `${argent.enRetard} personne${argent.enRetard > 1 ? 's' : ''} concernée${argent.enRetard > 1 ? 's' : ''}`
              }
              icone={Wallet}
              accent
            />
            <TuileChiffre
              libelle="Encaissé"
              valeur={formaterMontant(argent.encaisse, bord.devise)}
              detail={bord.libellePeriode}
              icone={TrendingUp}
            />
          </>
        )}

        <TuileChiffre
          libelle="Séances à renseigner"
          valeur={String(pedagogie.aNoter)}
          detail={
            pedagogie.aNoter === 0
              ? 'Rien en retard'
              : `sur ${bord.seancesPassees} séance${bord.seancesPassees > 1 ? 's' : ''} passée${bord.seancesPassees > 1 ? 's' : ''}`
          }
          icone={PenLine}
          accent={!bord.voitArgent}
        />

        <TuileChiffre
          libelle={bord.voitArgent ? 'Apprenants actifs' : 'Mes cours'}
          valeur={String(bord.voitArgent ? bord.apprenantsActifs : bord.coursActifs)}
          detail={
            bord.voitArgent
              ? `${bord.coursActifs} cours actif${bord.coursActifs > 1 ? 's' : ''}`
              : `${pedagogie.aVenir} séance${pedagogie.aVenir > 1 ? 's' : ''} à venir`
          }
          icone={bord.voitArgent ? Users : BookOpen}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {bord.voitArgent && (
            <section className="space-y-3 rounded-xl border bg-card p-4">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <UserRoundCheck className="size-4 text-muted-foreground" aria-hidden="true" />
                Qui n'a pas payé
              </h2>
              <ListeImpayes impayes={bord.impayes} />
            </section>
          )}

          <section className="space-y-3 rounded-xl border bg-card p-4">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <CalendarClock className="size-4 text-muted-foreground" aria-hidden="true" />
              Aujourd'hui
            </h2>
            <CoursDuJourListe cours={bord.coursDuJour} />
          </section>

          {bord.voitArgent && bord.aDesEncaissements && (
            <section className="space-y-3 rounded-xl border bg-card p-4">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <TrendingUp className="size-4 text-muted-foreground" aria-hidden="true" />
                Encaissements
              </h2>
              <GrapheEncaissements points={bord.encaissements} devise={bord.devise} />
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="space-y-4 rounded-xl border bg-card p-4">
            <h2 className="text-sm font-medium">Indicateurs</h2>

            <div className="flex flex-wrap items-start justify-around gap-4">
              <Jauge
                valeur={assiduite.taux}
                libelle="Assiduité"
                vide="—"
              />
              {bord.voitArgent && argent && (
                <Jauge valeur={argent.recouvrement} libelle="Recouvrement" vide="—" />
              )}
              {bord.renouvellement && (
                <Jauge
                  valeur={bord.renouvellement.retention}
                  libelle="Réinscriptions"
                  vide="—"
                />
              )}
            </div>

            {/*
              Le détail sous les anneaux : un pourcentage seul ne dit pas s'il
              porte sur trois pointages ou sur trois cents.
            */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Pointages</dt>
              <dd className="text-right tabular-nums">{assiduite.total}</dd>

              <dt className="text-muted-foreground">Absences</dt>
              <dd className="text-right tabular-nums">{assiduite.absent}</dd>

              {bord.renouvellement && (
                <>
                  <dt className="text-muted-foreground">Nouveaux</dt>
                  <dd className="text-right tabular-nums">{bord.renouvellement.nouveaux}</dd>

                  <dt className="text-muted-foreground">Non revenus</dt>
                  <dd className="text-right tabular-nums">{bord.renouvellement.partis}</dd>
                </>
              )}

              {bord.coursTermines > 0 && (
                <>
                  <dt className="text-muted-foreground">Cours terminés</dt>
                  <dd className="text-right tabular-nums">{bord.coursTermines}</dd>
                </>
              )}
            </dl>
          </section>

          {bord.voitArgent && (
            <section className="space-y-3 rounded-xl border bg-card p-4">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <GraduationCap className="size-4 text-muted-foreground" aria-hidden="true" />
                Par enseignant
              </h2>
              <ResumeEnseignants enseignants={bord.enseignants} />
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
