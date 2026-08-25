import { ETATS_PRESENCE, LIBELLES_ETAT, type EtatPresence } from '@/shared/lib/rapport'
import { SelectNatif } from '@/shared/ui/SelectNatif'

export interface SelecteurEtatPresenceProps {
  /** État **effectif** : celui de la ligne, ou celui déduit du booléen. */
  valeur: EtatPresence
  nomComplet: string
  onChoisir: (etat: EtatPresence) => void
  desactive?: boolean
}

/**
 * Précise l'état de présence d'un apprenant — facultatif : la case à cocher
 * suffit à qui n'a pas besoin de nuance.
 *
 * Liste **native** et non le `Select` de shadcn/ui, à cause de l'endroit où
 * elle vit — une ligne de liste répétée, sur mobile :
 *
 * - le sélecteur natif s'ouvre en pleine largeur, à portée du pouce, avec les
 *   libellés entiers, là où un popover ancré à droite d'une ligne étroite se bat
 *   avec le bord de l'écran ;
 * - il y a une instance **par apprenant inscrit** : autant de portails, de
 *   verrous de défilement et d'`aria-hidden` sur toute l'application, pour un
 *   choix à cinq valeurs ;
 * - clavier et lecteurs d'écran fonctionnent sans rien câbler.
 */
export function SelecteurEtatPresence({
  valeur,
  nomComplet,
  onChoisir,
  desactive = false,
}: SelecteurEtatPresenceProps) {
  return (
    <SelectNatif
      aria-label={`État de présence de ${nomComplet}`}
      value={valeur}
      disabled={desactive}
      onChange={(evenement) => onChoisir(evenement.currentTarget.value as EtatPresence)}
      className="h-8 px-1.5 text-xs"
    >
      {ETATS_PRESENCE.map((etat) => (
        <option key={etat} value={etat}>
          {LIBELLES_ETAT[etat]}
        </option>
      ))}
    </SelectNatif>
  )
}
