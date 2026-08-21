import { FOND_ETAT, jourMois, LETTRE_ETAT, nombreFr } from '@/features/rapport/formatage'
import { ETATS_PRESENCE, LIBELLES_ETAT } from '@/shared/lib/rapport'
import type { ColonneSeance, LigneRapport } from '@/shared/lib/rapportSession'
import { cn } from '@/shared/lib/utils'

export interface GrillePresenceProps {
  colonnes: ColonneSeance[]
  lignes: LigneRapport[]
  /** Numéro de la première ligne — les blocs successifs continuent la série. */
  premierNumero: number
  baremeAssiduite: number
}

/**
 * Présence par séance. Les colonnes sont titrées par la **date** ; le contenu
 * travaillé titre celles de la grille des notes.
 */
export function GrillePresence({
  colonnes,
  lignes,
  premierNumero,
  baremeAssiduite,
}: GrillePresenceProps) {
  return (
    <table className="text-[7.5pt] leading-tight">
      <colgroup>
        <col className="w-[6mm]" />
        <col className="w-[46mm]" />
        {colonnes.map((colonne) => (
          <col key={colonne.seance_id} />
        ))}
        <col className="w-[13mm]" />
        <col className="w-[13mm]" />
        <col className="w-[13mm]" />
        <col className="w-[16mm]" />
        <col className="w-[18mm]" />
      </colgroup>

      <thead>
        <tr className="bg-emerald-900 text-[6.5pt] font-semibold text-white">
          <th scope="col" className="border-emerald-900" />
          <th scope="col" className="col-apprenant border-emerald-900">
            Apprenant
          </th>
          {colonnes.map((colonne) => (
            <th key={colonne.seance_id} scope="col" className="border-emerald-900">
              {jourMois(colonne.date)}
            </th>
          ))}
          <th scope="col" className="border-emerald-900">
            Prés.
          </th>
          <th scope="col" className="border-emerald-900">
            Abs.
          </th>
          <th scope="col" className="border-emerald-900">
            Ret.
          </th>
          <th scope="col" className="border-emerald-900">
            %
          </th>
          <th scope="col" className="border-emerald-900">
            Assiduité /{nombreFr(baremeAssiduite, 0)}
          </th>
        </tr>
      </thead>

      <tbody>
        {lignes.map((ligne, index) => (
          <tr key={ligne.apprenant_id} className="odd:bg-muted/50">
            <td className="text-muted-foreground">{premierNumero + index}</td>
            <td className="col-apprenant">
              <NomApprenant ligne={ligne} />
            </td>

            {colonnes.map((colonne) => {
              const etat = ligne.etats[colonne.seance_id] ?? 'present'

              return (
                <td
                  key={colonne.seance_id}
                  className={cn('font-semibold', FOND_ETAT[etat])}
                  title={`${LIBELLES_ETAT[etat]} — ${jourMois(colonne.date)}`}
                >
                  {LETTRE_ETAT[etat]}
                </td>
              )
            })}

            <td className="font-semibold">{ligne.comptage.presences}</td>
            <td className={cn('font-semibold', ligne.comptage.absences > 0 && 'text-rose-700')}>
              {ligne.comptage.absences}
            </td>
            <td className={cn('font-semibold', ligne.comptage.retards > 0 && 'text-amber-700')}>
              {ligne.comptage.retards}
            </td>
            <td className="font-semibold">{nombreFr(ligne.pourcentagePresence)} %</td>
            <td className="font-semibold">{nombreFr(ligne.assiduite)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** « **Salif** ANNE » — prénom en gras, nom en capitales, comme la maquette. */
function NomApprenant({ ligne }: { ligne: LigneRapport }) {
  return (
    <>
      <span className="font-semibold">{ligne.prenom}</span>{' '}
      <span className="uppercase">{ligne.nom}</span>
    </>
  )
}

/** Légende des cinq états, sous la grille. */
export function LegendeEtats() {
  return (
    <p className="eviter-coupure mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[6.5pt]">
      {ETATS_PRESENCE.map((etat) => (
        <span key={etat} className="flex items-center gap-1.5">
          <span
            className={cn(
              'flex size-[3.5mm] items-center justify-center border border-border font-semibold',
              FOND_ETAT[etat]
            )}
            aria-hidden="true"
          >
            {LETTRE_ETAT[etat]}
          </span>
          {LIBELLES_ETAT[etat]}
        </span>
      ))}
    </p>
  )
}
