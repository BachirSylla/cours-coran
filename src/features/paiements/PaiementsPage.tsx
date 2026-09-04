import { useState } from 'react'
import { Link } from 'react-router'
import { Loader2, TriangleAlert, Wallet } from 'lucide-react'

import { LignesReglements } from '@/features/paiements/components/LignesReglements'
import { NavigateurMois } from '@/features/paiements/components/NavigateurMois'
import {
  ReglementFormDialog,
  type CibleReglementNominatif,
} from '@/features/paiements/components/ReglementFormDialog'
import { TotauxMois } from '@/features/paiements/components/TotauxMois'
import { useMembre } from '@/features/membres/hooks/useMembre'
import { useReglements, type LigneFacturation } from '@/features/paiements/hooks/useReglements'
import { LIBELLES_MODE_FACTURATION } from '@/shared/lib/facturation'
import {
  formaterMontant,
  moisCourant,
  moisPrecedent,
  moisSuivant,
} from '@/shared/lib/paiements'
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'

/**
 * Suivi des règlements, **nominatif** depuis la migration 0026 : une ligne par
 * personne et par période, et non plus un total par cours.
 *
 * La période dépend du rythme du centre. En mensuel on navigue de mois en mois ;
 * au forfait il n'y a rien à parcourir — la session EST la période, et un
 * navigateur y serait un faux choix.
 */
export function PaiementsPage() {
  const [mois, setMois] = useState(moisCourant)
  const [cible, setCible] = useState<CibleReglementNominatif | null>(null)
  const { estResponsable, chargement } = useMembre()

  const { mode, lignes, totaux, autreMode, session, isPending, isError, error } =
    useReglements(mois)

  /*
   * ⚠️ La base REFUSE un forfait sur une session sans date de fin (P0080). Le
   * dire sans fermer la saisie laissait découvrir l'interdit APRÈS avoir compté
   * l'argent, dans le dialogue — le pire moment. L'alerte et le verrou vont
   * ensemble.
   */
  const forfaitImpossible = mode === 'par_session' && session?.date_fin === null

  // Toutes les lignes d'une période partagent en pratique la même devise ; on
  // prend celle de la première plutôt que d'inventer un total multi-devises.
  const devise = lignes[0]?.devise ?? 'XOF'

  function ouvrirReglement(ligne: LigneFacturation) {
    setCible({
      inscription_id: ligne.inscription_id,
      apprenant: ligne.apprenant,
      cours_libelle: ligne.cours_libelle,
      mois: ligne.mois,
      session_id: ligne.session_id,
      session_nom: session?.nom ?? null,
      montant_du: ligne.montant_du,
      montant_recu: ligne.montant_recu,
      devise: ligne.devise,
    })
  }

  // L'onglet est masqué pour un enseignant, mais l'URL reste tapable. La RLS lui
  // renvoie zéro ligne : sans ce mot, il verrait un tableau de bord vide et
  // croirait à une panne (migration 0012).
  if (!chargement && !estResponsable) {
    return (
      <Alert>
        <Wallet className="size-4" aria-hidden="true" />
        <AlertTitle>Réservé au responsable</AlertTitle>
        <AlertDescription>
          Le suivi des règlements n'est pas accessible depuis un compte enseignant.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Paiements</h1>
          <p className="text-sm text-muted-foreground">
            {LIBELLES_MODE_FACTURATION[mode]}
            {mode === 'par_session' && session ? ` · ${session.nom}` : ''} — à titre indicatif.
          </p>
        </div>

        {/* Au forfait, il n'y a qu'une période : un navigateur de mois y
            donnerait l'illusion d'un choix qui n'existe pas. */}
        {mode === 'mensuel' && (
          <NavigateurMois
            mois={mois}
            onPrecedent={() => setMois(moisPrecedent(mois))}
            onSuivant={() => setMois(moisSuivant(mois))}
            onMoisCourant={() => setMois(moisCourant())}
            estMoisCourant={mois === moisCourant()}
          />
        )}
      </div>

      {mode === 'par_session' && session?.date_fin === null && (
        <Alert>
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertDescription>
            « {session.nom} » n'a pas de date de fin. Un forfait suppose une période qui se
            termine : donnez-lui une date de fin dans les paramètres avant d'enregistrer des
            règlements.
          </AlertDescription>
        </Alert>
      )}

      {/*
        Deux grains cohabitent, et deux écrans donneraient des chiffres
        différents sans explication. Celui qui n'affiche pas doit le dire : c'est
        ici que le responsable regarde, pas dans la fiche du cours.
      */}
      {autreMode.nombre > 0 && (
        <Alert>
          <AlertDescription>
            {autreMode.nombre === 1
              ? '1 règlement a été enregistré sous l’autre rythme de facturation'
              : `${autreMode.nombre} règlements ont été enregistrés sous l’autre rythme de facturation`}{' '}
            ({formaterMontant(autreMode.recu, devise)} encaissés). Ils ne sont pas comptés
            ci-dessous : repassez dans ce mode pour les consulter ou les corriger.
          </AlertDescription>
        </Alert>
      )}

      {isPending && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Chargement des règlements…
        </div>
      )}

      {isError && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertTitle>Chargement impossible</AlertTitle>
          <AlertDescription>{error?.message}</AlertDescription>
        </Alert>
      )}

      {!isPending && !isError && lignes.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Wallet className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-medium">
              {mode === 'mensuel' ? 'Rien à facturer ce mois-ci' : 'Rien à facturer'}
            </p>
            <p className="text-sm text-muted-foreground">
              Seuls les apprenants inscrits à un cours de cette session apparaissent ici.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/cours">Voir mes cours</Link>
          </Button>
        </div>
      )}

      {!isPending && !isError && lignes.length > 0 && (
        <div className="space-y-4">
          <TotauxMois du={totaux.du} recu={totaux.recu} reste={totaux.reste} devise={devise} />
          <LignesReglements
            lignes={lignes}
            saisieFermee={forfaitImpossible}
            onEnregistrer={ouvrirReglement}
          />
        </div>
      )}

      <ReglementFormDialog
        cible={cible}
        onOuvertChange={(ouvert) => {
          if (!ouvert) setCible(null)
        }}
      />
    </div>
  )
}
