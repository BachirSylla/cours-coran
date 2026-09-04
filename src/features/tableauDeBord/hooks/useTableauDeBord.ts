import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useCours } from '@/features/cours/hooks/useCours'
import { useMembre } from '@/features/membres/hooks/useMembre'
import { useMembres } from '@/features/membres/hooks/useMembres'
import { useReglements } from '@/features/paiements/hooks/useReglements'
import { useSeancesSemaine } from '@/features/seances/hooks/useSeancesSemaine'
import { useSessionActive } from '@/features/sessions/hooks/useSessions'
import { detecterTousLesConflits, type JourSemaine } from '@/shared/lib/conflits'
import { dateLocale, type ModeFacturation } from '@/shared/lib/facturation'
import { libelleMois, moisCourant, moisDe } from '@/shared/lib/paiements'
import {
  assemblerTableauDeBord,
  type CoursPourBord,
  type LigneNommee,
  type TableauDeBord,
} from '@/shared/lib/tableauDeBord'
import { tarifDuCours } from '@/shared/supabase/coursRepo'
import * as tableauDeBordRepo from '@/shared/supabase/tableauDeBordRepo'

/**
 * Fenêtre d'observation des séances.
 *
 * ⚠️ Elle borne ce que « séances à renseigner » peut voir. Trop courte, le
 * compteur d'un centre qui revient de vacances repart à zéro, et l'alerte promet
 * une exhaustivité qu'elle n'a pas. On part donc du **début de la session**,
 * plafonné : au-delà, ce n'est plus un retard, c'est de l'archive.
 */
const JOURS_MAX = 240
const JOURS_APRES = 7

export const tableauDeBordKeys = {
  tous: ['tableau-de-bord'] as const,
  pointages: (coursIds: readonly string[]) =>
    [...tableauDeBordKeys.tous, 'pointages', [...coursIds].sort().join(',')] as const,
  inscrits: (coursIds: readonly string[]) =>
    [...tableauDeBordKeys.tous, 'inscrits', [...coursIds].sort().join(',')] as const,
  encaissements: (coursIds: readonly string[]) =>
    [...tableauDeBordKeys.tous, 'encaissements', [...coursIds].sort().join(',')] as const,
}

/** Un cours du jour, tel que l'écran l'affiche. */
export interface CoursDuJour {
  cours_id: string
  libelle: string
  heure_debut: string
  heure_fin: string | null
  enseignant: string
  /** URL de visioconférence — Meet, Zoom, ou autre : ce n'est qu'un lien. */
  lien: string | null
  /** La séance a eu lieu mais rien n'y a été saisi. */
  aNoter: boolean
}

export interface ResultatTableauDeBord extends TableauDeBord {
  /** `false` pour un enseignant : aucune donnée d'argent n'est alors demandée. */
  voitArgent: boolean
  mode: ModeFacturation
  session: { id: string; nom: string; date_fin: string | null; statut: string } | null
  /** Période que couvre la carte d'argent — un mois, ou la session. */
  libellePeriode: string
  devise: string
  coursDuJour: CoursDuJour[]

  isPending: boolean
  isError: boolean
  error: Error | null
}

function decaler(jours: number, depuis = new Date()): string {
  const date = new Date(depuis)
  date.setDate(date.getDate() + jours)

  return dateLocale(date)
}

/**
 * Tout ce que l'accueil affiche, en une fois.
 *
 * Ce hook **collecte** ; il ne décide de rien. Les décisions vivent dans
 * `assemblerTableauDeBord` (module pur), parce que ce projet ne teste pas les
 * hooks et que ces chiffres portent sur de l'argent et sur du travail en retard.
 *
 * ⚠️ **Il n'ouvre aucune porte.** Chaque donnée passe par la RLS de l'appelant :
 * `reglement` et `tarif` sont gardées `est_responsable()` en LECTURE, et
 * `cours_lisibles()` ne rend à un enseignant que les cours dont il est
 * l'enseignant **affecté** — pas tous ceux du centre. Le drapeau `voitArgent`
 * évite simplement de demander ce qui reviendrait vide.
 *
 * ⚠️ **Aucun montant n'est recalculé.** Tout vient de `useReglements`, donc de
 * `assemblerFacturation` : changer un tarif ne peut pas faire bouger un
 * « encaissé » passé (invariant 0026).
 */
export function useTableauDeBord(): ResultatTableauDeBord {
  const { estResponsable, chargement: chargementMembre } = useMembre()
  const { session, erreur: erreurSession } = useSessionActive()

  const aujourdHui = dateLocale()

  /*
   * ⚠️ Le mois d'argent est BORNÉ à la session affichée. Pris en dur au mois
   * courant, il donnait — sur une session terminée en juin, consultée en
   * septembre — une liste d'impayés vide et un « Tout est réglé » mensonger,
   * pendant que l'en-tête annonçait « Session 17 · septembre ». On regarde le
   * dernier mois que la session couvre réellement.
   */
  const finSession = session?.date_fin ?? null
  const mois = useMemo(() => {
    const courant = moisCourant()
    const fin = finSession === null ? null : moisDe(finSession)

    return fin !== null && fin < courant ? fin : courant
  }, [finSession])

  const requeteCours = useCours()
  const requeteMembres = useMembres()

  /*
   * Aucune requête d'argent pour un enseignant : la RLS lui rendrait de toute
   * façon zéro règlement, mais l'accueil est l'écran le plus ouvert de
   * l'application — autant ne pas payer l'aller-retour.
   */
  const facturation = useReglements(mois, estResponsable)

  const cours = useMemo(() => requeteCours.data ?? [], [requeteCours.data])
  const coursIds = useMemo(() => cours.map((unCours) => unCours.id), [cours])

  const debutSession = session?.date_debut ?? null
  const debutFenetre = useMemo(() => {
    const plafond = decaler(-JOURS_MAX)

    return debutSession === null || debutSession < plafond ? plafond : debutSession
  }, [debutSession])

  const seances = useSeancesSemaine(debutFenetre, decaler(JOURS_APRES))

  const requetePointages = useQuery({
    queryKey: tableauDeBordKeys.pointages(coursIds),
    queryFn: () => tableauDeBordRepo.listPointages(coursIds),
    enabled: coursIds.length > 0,
  })

  /*
   * La session précédente, retrouvée par `reconduit_de` (0024) : c'est ce qui
   * permet de dire « revenu » plutôt que « parti puis nouveau » pour qui change
   * de niveau. UNE requête pour les deux sessions — les séparer aurait doublé un
   * aller-retour sur la même table.
   */
  const sourcesIds = useMemo(
    () =>
      cours
        .map((unCours) => unCours.reconduit_de)
        .filter((identifiant): identifiant is string => identifiant !== null)
        // ⚠️ Un `reconduit_de` qui pointerait un cours de la session courante
        // tomberait des DEUX côtés de la comparaison et la fausserait.
        .filter((identifiant) => !coursIds.includes(identifiant)),
    [cours, coursIds]
  )

  const idsInscrits = useMemo(() => [...coursIds, ...sourcesIds], [coursIds, sourcesIds])

  const requeteInscrits = useQuery({
    queryKey: tableauDeBordKeys.inscrits(idsInscrits),
    queryFn: () => tableauDeBordRepo.listInscritsDeCours(idsInscrits),
    enabled: idsInscrits.length > 0,
  })

  /*
   * ⚠️ La courbe a sa PROPRE lecture. Puisée dans les lignes de facturation,
   * elle ne pouvait montrer que le mois consulté : `assemblerFacturation` filtre
   * déjà sur la période affichée, si bien que cinq des six barres étaient
   * structurellement vides.
   */
  const requeteEncaissements = useQuery({
    queryKey: tableauDeBordKeys.encaissements(coursIds),
    queryFn: () => tableauDeBordRepo.listReglementsDesCours(coursIds),
    enabled: estResponsable && coursIds.length > 0,
  })

  const nomDe = useMemo(() => {
    const noms = new Map(
      (requeteMembres.data ?? []).map((membre) => [membre.user_id, membre.nom_affiche])
    )

    return (identifiant: string | null): string =>
      identifiant === null ? 'Sans enseignant' : (noms.get(identifiant) ?? 'Enseignant retiré')
  }, [requeteMembres.data])

  /*
   * ⚠️ On dépend des TABLEAUX, pas des objets rendus par les hooks : ceux-ci
   * sont recréés à chaque rendu, et le `useMemo` ne mémoïsait alors rien — la
   * détection de conflits, quadratique par agenda, était refaite à chaque frappe
   * ailleurs dans l'arbre.
   */
  const vues = seances.vues
  const lignes = facturation.lignes as LigneNommee[]
  const mode = facturation.mode

  const assemble = useMemo(() => {
    const actifs = cours.filter((unCours) => unCours.statut === 'actif')
    const idsActifs = new Set(actifs.map((unCours) => unCours.id))
    const idsSession = new Set(coursIds)

    /*
     * Les occurrences des cours ACTIFS. `cours_lisibles()` ne rend déjà à un
     * enseignant que ses propres cours : ce filtre-ci porte sur le statut, pas
     * sur les droits.
     */
    const occurrences = vues
      .filter((vue) => idsActifs.has(vue.cours_id))
      .map((vue) => ({
        cours_id: vue.cours_id,
        date: vue.date,
        heure_debut: vue.heure_debut,
        saisie: vue.saisie,
        statut: vue.seance?.statut ?? null,
      }))

    /*
     * Les apprenants, répartis entre la session et celle qu'elle reconduit.
     * ⚠️ « Actifs » veut dire inscrits à un cours ACTIF : un cours en pause ou
     * terminé ne fait plus venir personne, et le compter gonflerait le chiffre
     * pendant que la tuile annonce, juste à côté, le nombre de cours actifs.
     */
    const apprenantsMaintenant = new Set<string>()
    const apprenantsAvant = new Set<string>()

    for (const inscrit of requeteInscrits.data ?? []) {
      if (idsActifs.has(inscrit.cours_id)) apprenantsMaintenant.add(inscrit.apprenant_id)
      else if (!idsSession.has(inscrit.cours_id)) apprenantsAvant.add(inscrit.apprenant_id)
    }

    const pourBord: CoursPourBord[] = cours.map((unCours) => {
      const tarif = tarifDuCours(unCours)
      const montant = mode === 'mensuel' ? tarif?.prix_mensuel : tarif?.prix_session

      return {
        id: unCours.id,
        statut: unCours.statut,
        enseignant_id: unCours.enseignant_id,
        inscrits: unCours.inscription[0]?.count ?? 0,
        // Un enseignant ne lit aucun tarif (`tarif` est fermée en lecture) :
        // lui signaler des cours « sans tarif » serait un faux diagnostic.
        sansTarif: estResponsable && montant == null,
      }
    })

    const conflits = detecterTousLesConflits(
      actifs.flatMap((unCours) =>
        unCours.creneau.map((creneau) => ({
          jour_semaine: creneau.jour_semaine as JourSemaine,
          heure_debut: creneau.heure_debut,
          heure_fin: creneau.heure_fin,
          enseignant_id: unCours.enseignant_id,
          session_id: unCours.session_id,
        }))
      )
    ).length

    return assemblerTableauDeBord({
      voitArgent: estResponsable,
      aujourdHui,
      lignes,
      reglementsRecents: requeteEncaissements.data ?? [],
      moisFin: moisCourant(),
      occurrences,
      pointages: requetePointages.data ?? [],
      cours: pourBord,
      apprenantsMaintenant,
      apprenantsAvant,
      aUneSessionSource: sourcesIds.length > 0 && requeteInscrits.data !== undefined,
      conflits,
      session: session ?? null,
      nomPeriode: (ligne) =>
        ligne.mois !== null ? libelleMois(ligne.mois) : (session?.nom ?? 'la session'),
      nomDe,
    })
  }, [
    cours,
    coursIds,
    vues,
    lignes,
    mode,
    estResponsable,
    aujourdHui,
    nomDe,
    session,
    sourcesIds.length,
    requetePointages.data,
    requeteInscrits.data,
    requeteEncaissements.data,
  ])

  const coursDuJour = useMemo(() => {
    const parCoursId = new Map(cours.map((unCours) => [unCours.id, unCours]))

    return vues
      .filter((vue) => vue.date === aujourdHui)
      .filter((vue) => parCoursId.get(vue.cours_id)?.statut === 'actif')
      .sort((a, b) => a.heure_debut.localeCompare(b.heure_debut))
      .map((vue) => ({
        cours_id: vue.cours_id,
        libelle: vue.cours_libelle,
        heure_debut: vue.heure_debut,
        heure_fin: vue.heure_fin,
        enseignant: nomDe(vue.enseignant_id),
        lien: parCoursId.get(vue.cours_id)?.lien_meet ?? null,
        aNoter: !vue.saisie,
      }))
  }, [cours, vues, aujourdHui, nomDe])

  return {
    ...assemble,
    voitArgent: estResponsable,
    mode,
    session: session ?? null,
    libellePeriode: mode === 'mensuel' ? libelleMois(mois) : (session?.nom ?? 'la session'),
    devise: lignes[0]?.devise ?? 'XOF',
    coursDuJour,

    isPending:
      chargementMembre ||
      requeteCours.isPending ||
      seances.isPending ||
      facturation.isPending ||
      /*
       * ⚠️ Les requêtes propres au lot comptent AUSSI. Sans elles, l'écran
       * affichait « Apprenants actifs 0 » et « Assiduité — » une fraction de
       * seconde avant que les chiffres sautent à leur vraie valeur. Sur un
       * chiffre d'audience, un zéro fugace est un mensonge lisible.
       */
      (coursIds.length > 0 && (requetePointages.isPending || requeteInscrits.isPending)),

    /*
     * ⚠️ TOUTES les requêtes, pas seulement trois. Un échec sur les pointages
     * affichait « Assiduité — · 0 absence » ; un échec sur la facturation,
     * « Tout est réglé ». Un 500 transitoire se lisait comme une bonne
     * nouvelle : une erreur doit se taire, jamais affirmer.
     */
    isError:
      Boolean(erreurSession) ||
      requeteCours.isError ||
      seances.isError ||
      facturation.isError ||
      requetePointages.isError ||
      requeteInscrits.isError ||
      requeteEncaissements.isError,
    error:
      erreurSession ??
      requeteCours.error ??
      seances.error ??
      facturation.error ??
      requetePointages.error ??
      requeteInscrits.error ??
      requeteEncaissements.error,
  }
}
