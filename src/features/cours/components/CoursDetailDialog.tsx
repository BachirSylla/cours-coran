import { useState } from 'react'
import { FileDown, Pencil } from 'lucide-react'

import { ExportRapportDialog } from '@/features/rapport/components/ExportRapportDialog'

import { LienMeet } from '@/features/cours/components/LienMeet'
import {
  abregeJour,
  LIBELLES_FORMAT,
  LIBELLES_STATUT_COURS,
  type FormatCours,
  type StatutCours,
} from '@/features/cours/coursSchema'
import { SectionReglagesCours } from '@/features/cours/components/SectionReglagesCours'
import { SectionVisio } from '@/features/cours/components/SectionVisio'
import { useMembre } from '@/features/membres/hooks/useMembre'
import { SectionExamen } from '@/features/inscriptions/components/SectionExamen'
import { SectionInscriptions } from '@/features/inscriptions/components/SectionInscriptions'
import { SectionSuiviApprenant } from '@/features/inscriptions/components/SectionSuiviApprenant'
import { SectionPaiements } from '@/features/paiements/components/SectionPaiements'
import { SectionPartage } from '@/features/partage/components/SectionPartage'
import { SeanceFormDialog } from '@/features/seances/components/SeanceFormDialog'
import { SeancesRecentesCours } from '@/features/seances/components/SeancesRecentesCours'
import type { SeanceVueEnrichie } from '@/features/seances/regroupement'
import { tarifDuCours, type CoursAvecDetails } from '@/shared/supabase/coursRepo'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'

export interface CoursDetailDialogProps {
  cours: CoursAvecDetails | null
  onOuvertChange: (ouvert: boolean) => void
  onModifier: (cours: CoursAvecDetails) => void
}

function formatValide(format: string): FormatCours {
  return format === 'groupe' ? 'groupe' : 'individuel'
}

function statutValide(statut: string): StatutCours {
  return statut === 'pause' || statut === 'termine' ? statut : 'actif'
}

function formaterDate(date: string): string {
  const [annee, mois, jour] = date.split('-')
  return annee && mois && jour ? `${jour}/${mois}/${annee}` : date
}

function Champ({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{libelle}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

/**
 * Détail d'un cours. C'est la porte d'entrée depuis la liste comme depuis la
 * grille — et l'endroit où la frontière des rôles se voit le mieux.
 *
 * Deux autorités distinctes, et elles ne se recouvrent pas (migration 0017) :
 *
 *   * le **responsable** tient la STRUCTURE — identité, planning, affectation,
 *     prix et règlements, composition de la classe ;
 *   * l'**enseignant affecté** anime SON cours — séances, notes, examen,
 *     réglages de notation, logo, lien visio, lien de partage, liens de suivi
 *     de suivi des apprenants.
 *
 * Un responsable qui enseigne le cours voit les deux ; un responsable qui ne
 * l'enseigne pas ne voit que la structure. La RLS refuse de toute façon ce qui
 * est masqué — le masquage évite seulement de tendre des boutons qui
 * échoueraient. Les LECTURES, elles, restent ouvertes aux deux : le rapport en
 * dépend.
 */
export function CoursDetailDialog({
  cours,
  onOuvertChange,
  onModifier,
}: CoursDetailDialogProps) {
  const [vueSaisie, setVueSaisie] = useState<SeanceVueEnrichie | null>(null)
  const [exportOuvert, setExportOuvert] = useState(false)
  const { estResponsable, userId } = useMembre()

  // L'autorité pédagogique tient à l'affectation, pas au rôle : un responsable
  // n'anime que les cours qu'il enseigne lui-même.
  const estEnseignantDuCours = cours !== null && cours.enseignant_id === userId

  return (
    <Dialog open={Boolean(cours)} onOpenChange={onOuvertChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {cours && (
          <>
            <DialogHeader>
              <DialogTitle>{cours.libelle}</DialogTitle>
              <DialogDescription>
                {cours.type_cours?.libelle ?? 'Type inconnu'} ·{' '}
                {LIBELLES_FORMAT[formatValide(cours.format)]} ·{' '}
                {LIBELLES_STATUT_COURS[statutValide(cours.statut)]}
              </DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-2 gap-4">
              <Champ libelle="Créneaux">
                {cours.creneau.length === 0 ? (
                  '—'
                ) : (
                  <ul className="tabular-nums">
                    {cours.creneau.map((creneau) => (
                      <li key={creneau.id}>
                        {abregeJour(creneau.jour_semaine)} {creneau.heure_debut.slice(0, 5)}–
                        {creneau.heure_fin.slice(0, 5)}
                      </li>
                    ))}
                  </ul>
                )}
              </Champ>

              <Champ libelle="Période">
                <span className="tabular-nums">
                  {formaterDate(cours.date_debut)}
                  {cours.date_fin ? ` → ${formaterDate(cours.date_fin)}` : ' → en cours'}
                </span>
              </Champ>

              {estResponsable && (
                <Champ libelle="Prix mensuel">
                  {tarifDuCours(cours)?.prix_mensuel == null
                    ? '—'
                    : `${tarifDuCours(cours)?.prix_mensuel} ${tarifDuCours(cours)?.devise}`}
                </Champ>
              )}

              {!estEnseignantDuCours && (
                <Champ libelle="Visioconférence">
                  <LienMeet lien={cours.lien_meet} />
                </Champ>
              )}
            </dl>

            <SectionInscriptions
              coursId={cours.id}
              format={cours.format}
              reconduitDe={cours.reconduit_de}
              lectureSeule={!estResponsable}
            />

            {estEnseignantDuCours && (
              <>
                <SectionVisio cours={cours} />
                <SectionPartage
                  coursId={cours.id}
                  libelle={cours.libelle}
                  jetonPartage={cours.jeton_partage}
                />
              </>
            )}

            <SeancesRecentesCours
              cours={cours}
              onOuvrir={setVueSaisie}
              lectureSeule={!estEnseignantDuCours}
            />

            {estEnseignantDuCours && (
              <>
                <SectionExamen coursId={cours.id} />
                <SectionSuiviApprenant coursId={cours.id} />
                <SectionReglagesCours cours={cours} />
              </>
            )}

            {estResponsable && <SectionPaiements cours={cours} />}

            <DialogFooter>
              <Button variant="outline" onClick={() => setExportOuvert(true)}>
                <FileDown className="size-4" aria-hidden="true" />
                Exporter le rapport
              </Button>
              <Button variant="outline" onClick={() => onOuvertChange(false)}>
                Fermer
              </Button>
              {estResponsable && (
                <Button onClick={() => onModifier(cours)}>
                  <Pencil className="size-4" aria-hidden="true" />
                  Modifier le cours
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>

      <SeanceFormDialog
        vue={vueSaisie}
        onOuvertChange={(ouvert) => {
          if (!ouvert) setVueSaisie(null)
        }}
      />

      {cours && (
        <ExportRapportDialog
          coursId={cours.id}
          cours={cours}
          ouvert={exportOuvert}
          onOuvertChange={setExportOuvert}
        />
      )}
    </Dialog>
  )
}
