import { FOND_NOTE, nombreFr } from '@/features/rapport/formatage'
import { TOTAL_NOTE_FINALE } from '@/shared/lib/rapport'
import {
  niveauNoteFinale,
  type ColonneSeance,
  type LigneRapport,
} from '@/shared/lib/rapportSession'
import { cn } from '@/shared/lib/utils'

export interface GrilleNotesProps {
  colonnes: ColonneSeance[]
  lignes: LigneRapport[]
  baremeAcademique: number
  /** `null` quand les examens ont des barèmes différents, ou qu'il n'y en a aucun. */
  baremeExamenCommun: number | null
}

/**
 * Notes de récitation et évaluation. Les colonnes sont titrées par le **contenu
 * travaillé** — « Aṭ-Ṭûr v1–14 », « Tadjwîd : … » — et seules les séances
 * portant au moins une note y figurent.
 */
export function GrilleNotes({
  colonnes,
  lignes,
  baremeAcademique,
  baremeExamenCommun,
}: GrilleNotesProps) {
  return (
    <table className="text-[7.5pt] leading-tight">
      <colgroup>
        <col className="w-[6mm]" />
        <col className="w-[46mm]" />
        {colonnes.map((colonne) => (
          <col key={colonne.seance_id} />
        ))}
        <col className="w-[10mm]" />
        <col className="w-[18mm]" />
        <col className="w-[18mm]" />
        <col className="w-[16mm]" />
        <col className="w-[20mm]" />
      </colgroup>

      <thead>
        <tr className="bg-emerald-900 text-[6.5pt] font-semibold text-white">
          <th scope="col" className="border-emerald-900" />
          <th scope="col" className="col-apprenant border-emerald-900">
            Apprenant
          </th>
          {colonnes.map((colonne) => (
            <th key={colonne.seance_id} scope="col" className="border-emerald-900">
              {colonne.libelle}
            </th>
          ))}
          <th scope="col" className="border-emerald-900">
            Nb
          </th>
          <th scope="col" className="border-emerald-900">
            Moy. rév.
            <br />/{TOTAL_NOTE_FINALE}
          </th>
          <th scope="col" className="border-emerald-900">
            Examen
            {/* L'en-tête ne fige pas « /20 » : il suit le barème réel, et
                s'efface si les examens n'ont pas tous le même. */}
            {baremeExamenCommun !== null && (
              <>
                <br />/{baremeExamenCommun}
              </>
            )}
          </th>
          <th scope="col" className="border-emerald-900">
            Note
            <br />/{nombreFr(baremeAcademique, 0)}
          </th>
          <th scope="col" className="border-emerald-900">
            Note finale
            <br />/{TOTAL_NOTE_FINALE}
          </th>
        </tr>
      </thead>

      <tbody>
        {lignes.map((ligne, index) => {
          const niveau = niveauNoteFinale(ligne.finale)

          return (
            <tr key={ligne.apprenant_id} className="odd:bg-muted/50">
              <td className="text-muted-foreground">{index + 1}</td>
              <td className="col-apprenant">
                <span className="font-semibold">{ligne.prenom}</span>{' '}
                <span className="uppercase">{ligne.nom}</span>
              </td>

              {colonnes.map((colonne) => {
                const note = ligne.notes[colonne.seance_id]

                return (
                  <td key={colonne.seance_id}>
                    {note ? nombreFr(note.note) : <span aria-label="pas de note">—</span>}
                  </td>
                )
              })}

              <td className="font-semibold">{ligne.nbNotes}</td>
              <td>{nombreFr(ligne.moyenneRevisions)}</td>
              <td>
                {ligne.examen === null
                  ? '—'
                  : baremeExamenCommun !== null
                    ? nombreFr(ligne.examen.note)
                    : // Barèmes hétérogènes : chaque note porte le sien, sans
                      // quoi un 9/10 se lirait comme un 9/20.
                      `${nombreFr(ligne.examen.note)}/${ligne.examen.note_bareme}`}
              </td>
              <td className="text-muted-foreground">{nombreFr(ligne.academique)}</td>
              <td
                className={cn(
                  'text-[8.5pt] font-bold',
                  niveau ? FOND_NOTE[niveau] : 'text-muted-foreground'
                )}
              >
                {nombreFr(ligne.finale)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
