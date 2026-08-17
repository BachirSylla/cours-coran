import { useEffect } from 'react'
import { useParams } from 'react-router'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { BookOpen, CalendarDays, Clock, Loader2, NotebookPen, Video } from 'lucide-react'

import { libelleJour } from '@/features/cours/coursSchema'
import {
  etatCoursPublic,
  lienRejoignable,
  type EtatCoursPublic,
} from '@/features/partage/etatCoursPublic'
import { useCoursPublic } from '@/features/partage/hooks/useCoursPublic'
import { dateDepuisChaine, normaliserHeure } from '@/shared/lib/seances'
import { useTheme } from '@/shared/lib/useTheme'
import type { CoursPublic } from '@/shared/supabase/coursPublicSchema'

/**
 * Page de cours partagée — le seul écran accessible **sans compte**.
 *
 * Aucune navigation, aucun lien vers l'application, aucune trace d'un
 * quelconque espace enseignant : un apprenant qui ouvre ce lien doit y trouver
 * son horaire et son bouton pour rejoindre, et rien qui l'invite ailleurs.
 *
 * Pensée comme un bon marque-page : autonome, lisible d'un coup d'œil, correcte
 * une fois épinglée à l'écran d'accueil. (Le manifeste PWA reste celui de
 * l'application, dont le `start_url` vaut `/` : une *installation* depuis cette
 * page ouvrirait l'écran de connexion de l'enseignant. C'est pourquoi le
 * bandeau d'installation n'apparaît pas ici — il vit dans `AppLayout`.)
 */
export function PageCoursPublic() {
  const { jeton } = useParams<{ jeton: string }>()
  const { data: cours, isPending, isError } = useCoursPublic(jeton)

  // La classe `dark` est posée par `AppLayout`, qui n'entoure pas cette page.
  useTheme()
  useSansIndexation()

  useEffect(() => {
    document.title = cours ? `${cours.libelle} — Cours Coran` : 'Cours Coran'
  }, [cours])

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

        {/* Lien révoqué, tronqué, ou réseau muet : dans tous les cas l'apprenant
            ne peut rien y faire seul. Un seul message, sans jargon. */}
        {!isPending && (isError || !cours) && <LienInvalide />}

        {!isPending && !isError && cours && <FicheCours cours={cours} />}
      </main>
    </div>
  )
}

function FicheCours({ cours }: { cours: CoursPublic }) {
  const etat = etatCoursPublic(cours, new Date())
  const lien = lienRejoignable(cours, etat)

  return (
    <div className="space-y-6">
      <header className="space-y-3 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <BookOpen className="size-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance">
            {cours.libelle}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{cours.type_libelle}</p>
        </div>
      </header>

      <ProchaineSeance etat={etat} />

      {lien ? (
        <a
          href={lien}
          target="_blank"
          // `noreferrer` empêche le jeton de partage, qui est dans l'URL de
          // cette page, de partir dans l'en-tête Referer vers le service de
          // visioconférence.
          rel="noopener noreferrer"
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Video className="size-5" aria-hidden="true" />
          Rejoindre le cours
        </a>
      ) : (
        etat.type !== 'pause' &&
        etat.type !== 'termine' && (
          <p className="rounded-xl border border-dashed px-4 py-4 text-center text-sm text-muted-foreground">
            Le lien de visioconférence n'a pas encore été ajouté. Votre enseignant vous le
            transmettra.
          </p>
        )
      )}

      <Bloc icone={Clock} titre="Horaires de la semaine">
        {cours.creneaux.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun horaire fixé pour le moment.</p>
        ) : (
          <ul className="space-y-1">
            {cours.creneaux.map((creneau) => (
              <li
                key={`${creneau.jour_semaine}-${creneau.heure_debut}`}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span>{libelleJour(creneau.jour_semaine)}</span>
                <span className="text-muted-foreground tabular-nums">
                  {normaliserHeure(creneau.heure_debut)} – {normaliserHeure(creneau.heure_fin)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Bloc>

      {cours.dernier_exercice && (
        <Bloc icone={NotebookPen} titre="À réviser pour la prochaine fois">
          <p className="text-sm whitespace-pre-line">{cours.dernier_exercice}</p>
        </Bloc>
      )}
    </div>
  )
}

function ProchaineSeance({ etat }: { etat: EtatCoursPublic }) {
  if (etat.type === 'termine') {
    return <Annonce>Ce cours est terminé.</Annonce>
  }

  if (etat.type === 'pause') {
    return (
      <Annonce>Ce cours est en pause. Votre enseignant vous préviendra de la reprise.</Annonce>
    )
  }

  if (etat.type === 'a_venir') {
    return <Annonce>Ce cours débute le {formaterJour(etat.date)}.</Annonce>
  }

  if (etat.type === 'aucune') {
    return <Annonce>Aucune séance n'est prévue dans les prochains jours.</Annonce>
  }

  const { occurrence } = etat

  return (
    <div className="rounded-xl bg-accent px-4 py-4 text-center text-accent-foreground">
      <p className="text-xs font-medium tracking-wide uppercase opacity-80">Prochaine séance</p>
      <p className="mt-1 text-lg font-semibold first-letter:uppercase">
        {formaterJour(occurrence.date)}
      </p>
      <p className="text-sm tabular-nums opacity-90">
        {normaliserHeure(occurrence.heure_debut)} – {normaliserHeure(occurrence.heure_fin)}
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
  icone: typeof Clock
  titre: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Icone className="size-4 text-muted-foreground" aria-hidden="true" />
        {titre}
      </h2>
      {children}
    </section>
  )
}

function Annonce({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed px-4 py-4 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

/** « lundi 24 août » — la majuscule est posée en CSS (`first-letter:uppercase`). */
function formaterJour(date: string): string {
  return format(dateDepuisChaine(date), 'EEEE d MMMM', { locale: fr })
}

/**
 * Le jeton de partage est dans l'URL : cette page ne doit jamais se retrouver
 * dans un index de moteur de recherche. L'en-tête `X-Robots-Tag` posé par
 * `vercel.json` fait foi ; cette balise couvre le rendu local et les robots qui
 * ne lisent que le HTML.
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
