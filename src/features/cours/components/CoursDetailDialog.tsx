import { useState } from 'react'
import { Pencil } from 'lucide-react'

import { LienMeet } from '@/features/cours/components/LienMeet'
import {
  abregeJour,
  LIBELLES_FORMAT,
  LIBELLES_STATUT_COURS,
  type FormatCours,
  type StatutCours,
} from '@/features/cours/coursSchema'
import { SectionExamen } from '@/features/inscriptions/components/SectionExamen'
import { SectionInscriptions } from '@/features/inscriptions/components/SectionInscriptions'
import { SectionPaiements } from '@/features/paiements/components/SectionPaiements'
import { SectionPartage } from '@/features/partage/components/SectionPartage'
import { SeanceFormDialog } from '@/features/seances/components/SeanceFormDialog'
import { SeancesRecentesCours } from '@/features/seances/components/SeancesRecentesCours'
import type { SeanceVueEnrichie } from '@/features/seances/regroupement'
import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'
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
 * Détail d'un cours : ses informations, ses apprenants inscrits, et l'accès à
 * l'édition. C'est la porte d'entrée depuis la liste comme depuis la grille.
 */
export function CoursDetailDialog({
  cours,
  onOuvertChange,
  onModifier,
}: CoursDetailDialogProps) {
  const [vueSaisie, setVueSaisie] = useState<SeanceVueEnrichie | null>(null)

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

              <Champ libelle="Prix mensuel">
                {cours.prix_mensuel === null ? '—' : `${cours.prix_mensuel} ${cours.devise}`}
              </Champ>

              <Champ libelle="Visioconférence">
                <LienMeet lien={cours.lien_meet} />
              </Champ>
            </dl>

            <SectionInscriptions coursId={cours.id} format={cours.format} />

            <SectionPartage
              coursId={cours.id}
              libelle={cours.libelle}
              jetonPartage={cours.jeton_partage}
            />

            <SeancesRecentesCours cours={cours} onOuvrir={setVueSaisie} />

            <SectionExamen coursId={cours.id} />

            <SectionPaiements cours={cours} />

            <DialogFooter>
              <Button variant="outline" onClick={() => onOuvertChange(false)}>
                Fermer
              </Button>
              <Button onClick={() => onModifier(cours)}>
                <Pencil className="size-4" aria-hidden="true" />
                Modifier le cours
              </Button>
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
    </Dialog>
  )
}
