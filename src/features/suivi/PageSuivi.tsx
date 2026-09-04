import { useEffect } from 'react'
import { useParams } from 'react-router'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  BookOpen,
  CalendarDays,
  CloudOff,
  GraduationCap,
  Loader2,
  NotebookPen,
  Sparkles,
  TrendingUp,
} from 'lucide-react'

import { Sparkline } from '@/features/apprenants/components/Sparkline'
import { formaterNote, noteEnPourcentage } from '@/shared/lib/evaluations'
import { LIBELLES_ETAT, type EtatPresence } from '@/shared/lib/rapport'
import { dateDepuisChaine } from '@/shared/lib/seances'
import { useTheme } from '@/shared/lib/useTheme'
import type {
  AssiduiteSuivi,
  EvaluationSuivi,
  ParcoursApprenant,
  SuiviCours,
} from '@/shared/supabase/suiviSchema'
import { useSuiviApprenant } from '@/features/suivi/hooks/useSuiviApprenant'

/**
 * Parcours privé d'un apprenant — le second écran accessible **sans compte**.
 *
 * Depuis 0025, le lien ne montre plus un cours mais TOUT le parcours de son
 * porteur dans ce centre : un bloc par cours suivi, sessions comprises. Un
 * apprenant n'a qu'une progression — lui donner un lien par cours l'obligeait à
 * jongler avec trois adresses pour la lire.
 *
 * Ce que la page montre appartient à une seule personne et la nomme. Trois
 * partis pris en découlent :
 *
 *   * **rien qui n'ait été vraiment saisi**. Une séance sans note n'apparaît
 *     pas : une grille trouée se lirait comme un reproche, alors qu'elle ne
 *     dirait que la façon de travailler de l'enseignant ;
 *   * **aucune moyenne, aucune note finale**. Une moyenne à mi-parcours se lit
 *     comme un verdict ; la note de session a sa feuille, en fin de session ;
 *   * **aucune navigation**, aucun lien vers l'application, aucune trace d'un
 *     espace enseignant : personne ici n'a de compte, et n'en aura.
 *
 * La courbe est en **pourcentage** : sur une session, le barème peut changer, et
 * tracer les notes brutes mélangerait /10 et /20 en une ligne mensongère.
 */
export function PageSuivi() {
  const { jeton } = useParams<{ jeton: string }>()
  const { data: parcours, isPending, isError } = useSuiviApprenant(jeton)

  // La classe `dark` est posée par `AppLayout`, qui n'entoure pas cette page.
  useTheme()
  useSansIndexation()

  useEffect(() => {
    // Tous les blocs portent le même apprenant : le premier suffit.
    document.title = parcours?.[0] ? `${parcours[0].apprenant} — Suivi` : 'Suivi'
  }, [parcours])

  return (
    <div className="flex min-h-dvh flex-col bg-background px-4 py-8 sm:py-12">
      <main className="mx-auto w-full max-w-md flex-1">
        {isPending && (
          <p
            role="status"
            aria-live="polite"
            className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Chargement…
          </p>
        )}

        {/* Une PANNE n'est pas un lien mort. Les confondre annonçait « votre
            lien n'est plus valide » sur une simple coupure réseau — et envoyait
            l'apprenant redemander un lien qui fonctionne très bien. La
            distinction n'ouvre aucun oracle : une panne survient pareillement
            sur un jeton valide et sur un jeton révoqué. */}
        {!isPending && isError && <PanneTemporaire />}

        {/* Révoqué, régénéré, inventé, tronqué : un seul message, le même dans
            les quatre cas. En dire plus dirait qu'un apprenant existe. */}
        {!isPending && !isError && !parcours && <LienInvalide />}

        {!isPending && !isError && parcours && <Parcours parcours={parcours} />}
      </main>
    </div>
  )
}

/**
 * Le parcours entier : un en-tête pour la personne, puis un bloc par cours.
 *
 * ⚠️ L'ordre est INVERSÉ pour l'affichage. SQL rend le parcours du plus ancien
 * au plus récent — c'est la chronologie, et c'est le bon ordre pour la donnée.
 * Mais on ouvre ce lien pour voir sa dernière note, pas celle d'il y a deux ans :
 * le cours en cours vient donc en premier, et l'historique se déroule dessous.
 * C'est la même règle que les récitations à l'intérieur d'un bloc.
 */
function Parcours({ parcours }: { parcours: ParcoursApprenant }) {
  const duPlusRecent = [...parcours].reverse()
  const dernier = duPlusRecent[0]!

  return (
    <div className="space-y-8">
      <header className="space-y-3 text-center">
        {/* Le logo du cours le plus récent : c'est celui du centre s'il n'en a
            pas à lui, et c'est de toute façon l'actualité de l'apprenant. */}
        {dernier.logo ? (
          <img src={dernier.logo} alt="" className="mx-auto size-14 rounded-2xl object-contain" />
        ) : (
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <BookOpen className="size-6" aria-hidden="true" />
          </span>
        )}

        <div>
          {/* Le nom d'abord : on vérifie d'un coup d'œil qu'on est sur la bonne
              page. */}
          <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance">
            {dernier.apprenant}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{dernier.centre_nom}</p>
        </div>
      </header>

      {duPlusRecent.map((cours, index) => (
        /*
         * Aucun identifiant interne ne sort de SQL — c'est voulu (§5.8). La clé
         * combine donc le libellé et le rang, stable tant que l'ordre l'est.
         */
        <BlocCours
          key={`${cours.cours_libelle}-${index}`}
          cours={cours}
          historique={index > 0}
        />
      ))}

      <p className="pt-2 text-center text-xs text-muted-foreground">
        Ce lien est personnel. Toute personne qui l'ouvre voit ces informations : merci de ne
        pas le transmettre.
      </p>
    </div>
  )
}

/**
 * Un cours du parcours.
 *
 * `historique` ne change pas ce qui est montré — tout reste lisible — mais pose
 * un liseré et atténue le titre : la page doit dire d'un coup d'œil où finit
 * l'actualité et où commence le passé, sans rien cacher.
 */
function BlocCours({ cours, historique }: { cours: SuiviCours; historique: boolean }) {
  const notees = cours.evaluations
  const pourcentages = notees.map((evaluation) =>
    noteEnPourcentage(evaluation.note, evaluation.bareme)
  )

  return (
    <section
      className={
        historique ? 'space-y-4 border-t pt-6 opacity-90' : 'space-y-4'
      }
    >
      <div className="text-center">
        <h2 className="leading-tight font-semibold tracking-tight text-balance">
          {cours.cours_libelle}
        </h2>
        <p className="text-xs text-muted-foreground">
          {cours.type_libelle}
          {cours.enseignant ? ` · avec ${cours.enseignant}` : ''}
        </p>
      </div>

      <EtatSession statut={cours.statut} />

      {cours.exercices && (
        <div className="rounded-xl bg-accent px-4 py-4 text-accent-foreground">
          <h3 className="flex items-center gap-2 text-xs font-medium tracking-wide uppercase opacity-80">
            <NotebookPen className="size-4" aria-hidden="true" />À préparer
          </h3>
          <p className="mt-2 text-sm whitespace-pre-line">{cours.exercices}</p>
        </div>
      )}

      <Assiduite assiduite={cours.assiduite} />

      {/* Une seule note ne dessine pas une évolution : `Sparkline` le sait, mais
          le titre et le cadre n'auraient pas de sens non plus. */}
      {pourcentages.length >= 2 && (
        <Bloc icone={TrendingUp} titre="Progression">
          <Sparkline
            valeurs={pourcentages}
            largeur={320}
            hauteur={72}
            tousLesPoints
            className="h-auto w-full"
            titre={`Évolution des notes de ${cours.apprenant} en ${cours.cours_libelle}`}
          />
          <p className="mt-2 flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>{formaterJourCourt(notees[0]!.date)}</span>
            <span>{formaterJourCourt(notees.at(-1)!.date)}</span>
          </p>
        </Bloc>
      )}

      <Evaluations evaluations={notees} />

      {cours.examen && (
        <Bloc icone={GraduationCap} titre="Examen de fin de session">
          <p className="text-2xl font-semibold tabular-nums">
            {formaterNote(cours.examen.note, cours.examen.bareme)}
          </p>
        </Bloc>
      )}
    </section>
  )
}

/**
 * Contrairement au lien de visioconférence — qui donne un accès et doit se
 * refermer — les résultats restent lisibles après la fin du cours : ils sont
 * l'objet même de la page. On le dit, simplement.
 */
function EtatSession({ statut }: { statut: string }) {
  if (statut === 'termine') {
    return <Annonce>Cette session est terminée. Les résultats restent consultables.</Annonce>
  }

  if (statut === 'pause') {
    return <Annonce>Ce cours est en pause. Votre enseignant vous préviendra de la reprise.</Annonce>
  }

  return null
}

function Assiduite({ assiduite }: { assiduite: AssiduiteSuivi }) {
  // Aucune séance tenue : trois zéros n'apprendraient rien à personne.
  if (assiduite.seances === 0) return null

  const chiffres = [
    { valeur: assiduite.present, singulier: 'présence', pluriel: 'présences', toujours: true },
    { valeur: assiduite.retard, singulier: 'retard', pluriel: 'retards', toujours: true },
    { valeur: assiduite.absent, singulier: 'absence', pluriel: 'absences', toujours: true },
    // Excusées et partielles ne se montrent que s'il y en a : sinon, deux
    // colonnes à zéro qui n'ont jamais servi.
    { valeur: assiduite.excuse, singulier: 'excusée', pluriel: 'excusées', toujours: false },
    { valeur: assiduite.partiel, singulier: 'partielle', pluriel: 'partielles', toujours: false },
  ].filter((chiffre) => chiffre.toujours || chiffre.valeur > 0)

  return (
    <div className="rounded-xl border p-4">
      <h3 className="sr-only">Assiduité</h3>
      <dl className="flex flex-wrap justify-around gap-4 text-center">
        {chiffres.map((chiffre) => (
          <div key={chiffre.singulier}>
            <dd className="text-2xl font-semibold tabular-nums">{chiffre.valeur}</dd>
            <dt className="text-xs text-muted-foreground">
              {chiffre.valeur > 1 ? chiffre.pluriel : chiffre.singulier}
            </dt>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Sur {assiduite.seances} séance{assiduite.seances > 1 ? 's' : ''} tenue
        {assiduite.seances > 1 ? 's' : ''}.
      </p>
    </div>
  )
}

function Evaluations({ evaluations }: { evaluations: EvaluationSuivi[] }) {
  if (evaluations.length === 0) {
    return (
      <Annonce>
        Aucune récitation n'a encore été notée. Les notes apparaîtront ici au fil des séances.
      </Annonce>
    )
  }

  // Les plus récentes d'abord : c'est ce qu'on vient voir.
  const recentesDabord = [...evaluations].reverse()

  return (
    <Bloc icone={Sparkles} titre="Récitations notées">
      <ul className="divide-y">
        {recentesDabord.map((evaluation, index) => (
          <li key={`${evaluation.date}-${index}`} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 flex-1 text-sm font-medium">
                {evaluation.contenu ?? formaterJour(evaluation.date)}
              </p>
              <p className="text-sm font-semibold tabular-nums">
                {formaterNote(evaluation.note, evaluation.bareme)}
              </p>
            </div>

            <p className="text-xs text-muted-foreground tabular-nums">
              {formaterJourCourt(evaluation.date)}
              {libelleEtat(evaluation.etat) ? ` · ${libelleEtat(evaluation.etat)}` : ''}
            </p>

            {evaluation.commentaire && (
              <p className="mt-1 text-sm italic">« {evaluation.commentaire} »</p>
            )}
          </li>
        ))}
      </ul>
    </Bloc>
  )
}

function PanneTemporaire() {
  return (
    <div className="space-y-3 py-16 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <CloudOff className="size-6" aria-hidden="true" />
      </span>
      <h1 className="text-xl font-semibold tracking-tight">Affichage momentanément impossible</h1>
      <p className="mx-auto max-w-xs text-sm text-muted-foreground">
        Vérifiez votre connexion et réessayez dans un instant. Votre lien reste valide.
      </p>
    </div>
  )
}

function LienInvalide() {
  return (
    <div className="space-y-3 py-16 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <CalendarDays className="size-6" aria-hidden="true" />
      </span>
      <h1 className="text-xl font-semibold tracking-tight">Ce lien n'est plus valide</h1>
      <p className="mx-auto max-w-xs text-sm text-muted-foreground">
        Il a peut-être été remplacé. Demandez-en un nouveau à votre enseignant.
      </p>
    </div>
  )
}

function Bloc({
  icone: Icone,
  titre,
  children,
}: {
  icone: typeof TrendingUp
  titre: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Icone className="size-4 text-muted-foreground" aria-hidden="true" />
        {titre}
      </h3>
      {children}
    </div>
  )
}

function Annonce({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed px-4 py-4 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

/**
 * « Présent » ne s'affiche pas : c'est le cas ordinaire, et le répéter à chaque
 * ligne noierait le seul état qui mérite d'être vu. Un état inconnu — la base
 * pourrait en gagner un — ne fait pas échouer la page, il ne s'affiche pas.
 */
function libelleEtat(etat: string): string | null {
  if (etat === 'present') return null

  return LIBELLES_ETAT[etat as EtatPresence] ?? null
}

/** « lundi 24 août » — la majuscule est posée en CSS là où c'est utile. */
function formaterJour(date: string): string {
  return format(dateDepuisChaine(date), 'EEEE d MMMM', { locale: fr })
}

/** « 24 août » — assez pour situer une note dans la session. */
function formaterJourCourt(date: string): string {
  return format(dateDepuisChaine(date), 'd MMM', { locale: fr })
}

/**
 * Le jeton est dans l'URL : cette page ne doit jamais se retrouver dans un index
 * de moteur de recherche. L'en-tête `X-Robots-Tag` posé par `vercel.json` fait
 * foi ; cette balise couvre le rendu local et les robots qui ne lisent que le
 * HTML.
 */
function useSansIndexation() {
  useEffect(() => {
    const balise = document.createElement('meta')
    balise.name = 'robots'
    balise.content = 'noindex, nofollow'
    document.head.appendChild(balise)

    return () => {
      balise.remove()
    }
  }, [])
}
