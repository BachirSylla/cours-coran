import { useEffect, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router'
import {
  CalendarCheck,
  ChartColumn,
  Loader2,
  Printer,
  TriangleAlert,
  Trophy,
} from 'lucide-react'

import { GrilleNotes } from '@/features/rapport/components/GrilleNotes'
import { GrillePresence, LegendeEtats } from '@/features/rapport/components/GrillePresence'
import { dateFr, nombreFr } from '@/features/rapport/formatage'
import { useImpression } from '@/features/rapport/hooks/useImpression'
import { useRapportCours } from '@/features/rapport/hooks/useRapportCours'
import { lireRapportParams, type RapportParams } from '@/features/rapport/rapportParams'
import { TOTAL_NOTE_FINALE } from '@/shared/lib/rapport'
import {
  decouperEnBlocs,
  SEANCES_PAR_BLOC,
  type RapportSession,
} from '@/shared/lib/rapportSession'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'

import '@/features/rapport/rapport-imprimable.css'

/**
 * Rapport de fin de session — la feuille que l'enseignant imprime ou enregistre
 * en PDF.
 *
 * Rendue **hors de `AppLayout`** : ni navigation, ni pied de page de
 * l'application ne doivent atterrir sur le papier. Elle n'a pas de thème non
 * plus — la classe `.feuille` en fait un îlot clair, si bien que l'aperçu écran
 * *est* déjà le papier, même si l'enseignant travaille en thème sombre.
 */
export function RapportSessionPage() {
  const { coursId } = useParams<{ coursId: string }>()
  const [recherche] = useSearchParams()

  // `useSearchParams` renvoie une nouvelle instance à chaque rendu : la
  // dépendance porte sur la chaîne, pas sur l'objet.
  const chaine = recherche.toString()
  const params = useMemo(() => lireRapportParams(chaine), [chaine])
  const periode = useMemo(() => ({ debut: params.du, fin: params.au }), [params.du, params.au])

  const { cours, rapport, logo, isPending, isError, error } = useRapportCours(coursId, periode)
  const { imprimer, enCours } = useImpression()

  const titre = cours ? `Rapport — ${cours.libelle}` : 'Rapport de session'

  useEffect(() => {
    // Chrome se sert du titre du document comme nom de fichier par défaut.
    const precedent = document.title
    document.title = titre.replace(/[/\\]/g, '-')

    return () => {
      document.title = precedent
    }
  }, [titre])

  return (
    <div className="min-h-dvh bg-muted/40 py-6 print:min-h-0 print:bg-transparent print:py-0">
      <div className="mx-auto mb-4 flex w-[277mm] max-w-full items-center justify-between gap-3 px-4 print:hidden">
        <p className="text-sm text-muted-foreground">Aperçu à l'échelle réelle — A4 paysage.</p>
        <Button onClick={() => void imprimer()} disabled={isPending || !rapport || enCours}>
          {enCours ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Printer className="size-4" aria-hidden="true" />
          )}
          Imprimer / Enregistrer en PDF
        </Button>
      </div>

      <div className="feuille mx-auto w-[277mm] max-w-full px-[6mm] py-[5mm] shadow-lg print:m-0 print:w-auto print:max-w-none print:px-0 print:py-0 print:shadow-none">
        {isPending && (
          <p
            role="status"
            aria-live="polite"
            className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Préparation du rapport…
          </p>
        )}

        {isError && (
          <Alert variant="destructive">
            <TriangleAlert className="size-4" aria-hidden="true" />
            <AlertDescription>{error?.message}</AlertDescription>
          </Alert>
        )}

        {!isPending && !isError && rapport && (
          <Feuille
            rapport={rapport}
            params={params}
            libelleCours={cours?.libelle ?? ''}
            logo={logo}
          />
        )}
      </div>
    </div>
  )
}

function Feuille({
  rapport,
  params,
  libelleCours,
  logo,
}: {
  rapport: RapportSession
  params: RapportParams
  libelleCours: string
  logo: string | null
}) {
  const { synthese, config } = rapport
  const blocs = decouperEnBlocs(rapport.colonnesPresence, SEANCES_PAR_BLOC)

  return (
    <article className="space-y-[4mm]">
      <EnTete rapport={rapport} params={params} libelleCours={libelleCours} logo={logo} />

      <Synthese rapport={rapport} />

      <section className="space-y-[1.5mm]">
        <h2 className="text-[10pt] font-bold tracking-wide text-emerald-700 uppercase">
          Présence par séance
        </h2>

        {rapport.colonnesPresence.length === 0 ? (
          <Vide>Aucune séance tenue sur cette période.</Vide>
        ) : (
          blocs.map((bloc, index) => (
            <div key={bloc[0]?.seance_id ?? index} className={index > 0 ? 'saut-avant' : ''}>
              {blocs.length > 1 && (
                <p className="mb-[1mm] text-[7pt] text-muted-foreground">
                  Séances {index * SEANCES_PAR_BLOC + 1} à{' '}
                  {index * SEANCES_PAR_BLOC + bloc.length}
                </p>
              )}
              <GrillePresence
                colonnes={bloc}
                lignes={rapport.lignes}
                premierNumero={1}
                baremeAssiduite={config.bareme_assiduite}
                assiduiteActive={config.assiduite_active}
              />
            </div>
          ))
        )}

        <LegendeEtats />
      </section>

      <section className="space-y-[1.5mm]">
        <h2 className="text-[10pt] font-bold tracking-wide text-emerald-700 uppercase">
          Notes de récitation &amp; évaluation
        </h2>

        {rapport.colonnesNotes.length === 0 && synthese.nbApprenants === 0 ? (
          <Vide>Aucun apprenant inscrit à ce cours.</Vide>
        ) : (
          <GrilleNotes
            colonnes={rapport.colonnesNotes}
            lignes={rapport.lignes}
            baremeAcademique={config.bareme_academique}
            baremeExamenCommun={rapport.baremeExamenCommun}
            assiduiteActive={config.assiduite_active}
          />
        )}
      </section>

      <footer className="flex items-baseline justify-between border-t pt-[2mm] text-[7pt] text-muted-foreground">
        <span>Généré le {dateFr(aujourdhui())}</span>
        <span>Cours Coran · rapport de session</span>
      </footer>
    </article>
  )
}

function EnTete({
  rapport,
  params,
  libelleCours,
  logo,
}: {
  rapport: RapportSession
  params: RapportParams
  libelleCours: string
  logo: string | null
}) {
  const { synthese, periode } = rapport
  const badge = [
    params.niveau && `Niveau ${params.niveau}`,
    params.session && `Session ${params.session}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <header className="eviter-coupure space-y-[2mm]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-[4mm]">
          {/* Hauteur imposée, largeur libre, `object-contain` : un logo carré,
              large ou tout en hauteur s'y adapte sans jamais être déformé ni
              déborder sur le titre. Sans logo, aucun emblème de substitution. */}
          {logo && (
            <img
              src={logo}
              alt="Logo du centre"
              className="h-[12mm] w-auto max-w-[36mm] shrink-0 object-contain"
            />
          )}
          <div>
            <h1 className="text-[19pt] leading-none font-bold text-emerald-900">
              Rapport de fin de session
            </h1>
            <p className="mt-[1mm] text-[9pt] text-muted-foreground">
              Suivi de présence et des notes des apprenants
              {libelleCours && <> — {libelleCours}</>}
            </p>
          </div>
        </div>

        {badge && (
          <span className="rounded-md bg-emerald-800 px-[3mm] py-[1.5mm] text-[9pt] font-semibold text-white">
            {badge}
          </span>
        )}
      </div>

      <div className="border-b-[0.8mm] border-emerald-800" />

      <p className="flex flex-wrap gap-x-[8mm] gap-y-[1mm] text-[8.5pt]">
        <span>
          <strong>Période :</strong>{' '}
          {periode ? `du ${dateFr(periode.debut)} au ${dateFr(periode.fin)}` : '—'}
        </span>
        <span>
          <strong>Séances :</strong> {synthese.nbSeances}
        </span>
        <span>
          <strong>Apprenants :</strong> {synthese.nbApprenants}
        </span>
        {params.centre && (
          <span>
            <strong>Centre :</strong> {params.centre}
          </span>
        )}
      </p>
    </header>
  )
}

function Synthese({ rapport }: { rapport: RapportSession }) {
  const { synthese } = rapport

  return (
    <div className="eviter-coupure flex flex-wrap gap-[3mm]">
      <Carte libelle="Moyenne finale de la classe" icone={ChartColumn}>
        {nombreFr(synthese.moyenneFinale)}
        <span className="text-[9pt] font-normal">/{TOTAL_NOTE_FINALE}</span>
      </Carte>
      <Carte libelle="Présence moyenne" icone={CalendarCheck}>
        {nombreFr(synthese.presenceMoyenne)} %
      </Carte>
      <Carte libelle="Meilleure note" icone={Trophy}>
        {nombreFr(synthese.meilleureNote)}
      </Carte>
    </div>
  )
}

function Carte({
  libelle,
  icone: Icone,
  children,
}: {
  libelle: string
  icone: typeof ChartColumn
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-[52mm] items-center gap-[3mm] rounded-md border bg-muted/40 px-[4mm] py-[2.5mm]">
      {/* Décorative : la carte porte déjà son libellé. */}
      <span
        data-testid="carte-icone"
        className="flex size-[9mm] shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700"
      >
        <Icone className="size-[5mm]" aria-hidden="true" />
      </span>
      <div>
        <p className="text-[6.5pt] tracking-wider text-muted-foreground uppercase">{libelle}</p>
        <p className="mt-[0.5mm] text-[16pt] leading-none font-bold text-emerald-900">
          {children}
        </p>
      </div>
    </div>
  )
}

function Vide({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed px-[4mm] py-[6mm] text-center text-[8pt] text-muted-foreground">
      {children}
    </p>
  )
}

/** Date du jour au format `AAAA-MM-JJ`, en local. */
function aujourdhui(): string {
  const maintenant = new Date()
  const mois = String(maintenant.getMonth() + 1).padStart(2, '0')
  const jour = String(maintenant.getDate()).padStart(2, '0')

  return `${maintenant.getFullYear()}-${mois}-${jour}`
}
