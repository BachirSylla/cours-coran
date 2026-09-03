import { useState } from 'react'
import { FileDown } from 'lucide-react'

import { useRapportCours } from '@/features/rapport/hooks/useRapportCours'
import { urlRapport, type RapportParams } from '@/features/rapport/rapportParams'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { useSessionActive } from '@/features/sessions/hooks/useSessions'
import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'
import type { Session } from '@/shared/supabase/sessionRepo'
import { Label } from '@/shared/ui/label'

export interface ExportRapportDialogProps {
  coursId: string
  ouvert: boolean
  onOuvertChange: (ouvert: boolean) => void
  /**
   * Le cours dont on tire le rapport. Sert à pré-remplir l'en-tête et la
   * période depuis les VRAIES données — niveau du cours, nom et dates de sa
   * session — plutôt que de les faire retaper à chaque export.
   */
  cours?: CoursAvecDetails | null
}

interface Saisie {
  plage: boolean
  du: string
  au: string
  niveau: string
  session: string
  centre: string
}

function enParams(saisie: Saisie): RapportParams {
  const texte = (valeur: string) => (valeur.trim() === '' ? null : valeur.trim())

  return {
    du: saisie.plage ? texte(saisie.du) : null,
    au: saisie.plage ? texte(saisie.au) : null,
    niveau: texte(saisie.niveau),
    session: texte(saisie.session),
    centre: texte(saisie.centre),
  }
}

/**
 * Choix de la période et des mentions d'en-tête, avant d'ouvrir le rapport.
 *
 * Un compteur vivant annonce ce que la période retiendra : générer un rapport
 * vide et s'en apercevoir dans l'aperçu d'impression serait une perte de temps.
 */
/**
 * Valeurs proposées à l'ouverture, tirées des VRAIES données plutôt que
 * retapées à chaque export : le niveau du cours, le nom de sa session, et sa
 * période.
 *
 * ⚠️ La période ne se cale sur la session que si elle porte SES DEUX dates. Une
 * session perpétuelle n'a pas de fin, et cocher « limiter à une plage » avec une
 * borne vide ne retiendrait rien — un rapport vide, découvert à l'impression.
 *
 * Ce sont des propositions : tout reste modifiable, et un champ vidé le reste.
 */
function valeursProposees(cours: CoursAvecDetails | null, session: Session | null): Saisie {
  const plage = Boolean(session?.date_debut && session?.date_fin)

  return {
    plage,
    du: plage ? (session?.date_debut ?? '') : '',
    au: plage ? (session?.date_fin ?? '') : '',
    niveau: cours?.niveau ?? '',
    session: session?.nom ?? '',
    centre: '',
  }
}

export function ExportRapportDialog({
  coursId,
  ouvert,
  onOuvertChange,
  cours = null,
}: ExportRapportDialogProps) {
  return (
    <Dialog open={ouvert} onOpenChange={onOuvertChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {/*
          Le contenu ne vit que pendant l'ouverture, et sa `key` change avec le
          cours : tout son état s'initialise au montage, à partir des valeurs
          proposées. Aucun effet de synchronisation — un `setState` dans un effet
          écraserait ce que l'utilisateur vient d'effacer, et la règle ESLint du
          projet l'interdit à juste titre.
        */}
        {ouvert && (
          <ContenuExport
            key={coursId}
            coursId={coursId}
            cours={cours}
            onOuvertChange={onOuvertChange}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ContenuExport({
  coursId,
  cours,
  onOuvertChange,
}: {
  coursId: string
  cours: CoursAvecDetails | null
  onOuvertChange: (ouvert: boolean) => void
}) {
  const { sessions } = useSessionActive()
  const session = cours ? (sessions.find((s) => s.id === cours.session_id) ?? null) : null

  const [saisie, setSaisie] = useState<Saisie>(() => valeursProposees(cours, session))
  const params = enParams(saisie)

  // Le composant n'existe que pendant l'ouverture : la requête part toujours.
  const { rapport } = useRapportCours(coursId, {
    debut: params.du,
    fin: params.au,
  })

  function modifier(champ: keyof Saisie, valeur: string | boolean) {
    setSaisie((precedente) => ({ ...precedente, [champ]: valeur }))
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Exporter le rapport de session</DialogTitle>
        <DialogDescription>
          Le rapport s'ouvre dans un nouvel onglet, prêt à imprimer ou à enregistrer en PDF.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Période</legend>

          <div className="flex items-center gap-3">
            <Checkbox
              id="plage"
              checked={saisie.plage}
              onCheckedChange={(coche) => modifier('plage', coche === true)}
            />
            <Label htmlFor="plage" className="font-normal">
              Limiter à une plage de dates
            </Label>
          </div>

          {saisie.plage && (
            <div className="grid grid-cols-2 gap-3 pl-7">
              <div className="space-y-1.5">
                <Label htmlFor="du">Du</Label>
                <Input
                  id="du"
                  type="date"
                  value={saisie.du}
                  onChange={(evenement) => modifier('du', evenement.currentTarget.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="au">Au</Label>
                <Input
                  id="au"
                  type="date"
                  value={saisie.au}
                  onChange={(evenement) => modifier('au', evenement.currentTarget.value)}
                />
              </div>
            </div>
          )}

          {rapport && (
            <p className="pl-7 text-xs text-muted-foreground" role="status" aria-live="polite">
              {rapport.synthese.nbSeances} séance
              {rapport.synthese.nbSeances > 1 ? 's' : ''} · {rapport.synthese.nbApprenants}{' '}
              apprenant{rapport.synthese.nbApprenants > 1 ? 's' : ''}
            </p>
          )}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">
            En-tête <span className="font-normal text-muted-foreground">(facultatif)</span>
          </legend>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="niveau">Niveau</Label>
              <Input
                id="niveau"
                value={saisie.niveau}
                placeholder="9"
                onChange={(evenement) => modifier('niveau', evenement.currentTarget.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="session">Session</Label>
              <Input
                id="session"
                value={saisie.session}
                placeholder="16"
                onChange={(evenement) => modifier('session', evenement.currentTarget.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="centre">Centre</Label>
            <Input
              id="centre"
              value={saisie.centre}
              onChange={(evenement) => modifier('centre', evenement.currentTarget.value)}
            />
          </div>
        </fieldset>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOuvertChange(false)}>
          Annuler
        </Button>
        {/* Un onglet neuf : le rapport repart d'un document propre, et la
              fiche du cours reste ouverte derrière. */}
        <Button asChild>
          <a href={urlRapport(coursId, params)} target="_blank" rel="noopener noreferrer">
            <FileDown className="size-4" aria-hidden="true" />
            Générer
          </a>
        </Button>
      </DialogFooter>
    </>
  )
}
