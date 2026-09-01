import { cn } from '@/shared/lib/utils'

export interface SparklineProps {
  /** Valeurs en pourcentage (0–100), dans l'ordre chronologique. */
  valeurs: number[]
  largeur?: number
  hauteur?: number
  titre?: string
  /**
   * Un point sur chaque valeur, et non sur la seule dernière. À réserver aux
   * grands formats : en 120×32, les points se touchent et brouillent la ligne.
   */
  tousLesPoints?: boolean
  /**
   * Permet au tracé de devenir fluide (`w-full h-auto`) : le `viewBox` fait
   * alors tout le travail. Sans cela, le SVG garde la taille fixe qui convient
   * à une ligne de tableau.
   */
  className?: string
}

/**
 * Mini-courbe d'évolution, en SVG pur — aucune dépendance de graphe.
 *
 * L'échelle verticale est **fixée de 0 à 100 %** : une échelle ajustée aux
 * valeurs ferait paraître spectaculaire un écart d'un point. Les données sont
 * déjà en pourcentage, ce qui neutralise le mélange /10 et /20 — tracer les
 * notes brutes donnerait une courbe mensongère.
 */
export function Sparkline({
  valeurs,
  largeur = 120,
  hauteur = 32,
  titre,
  tousLesPoints = false,
  className,
}: SparklineProps) {
  // Un point isolé ne dessine pas une évolution.
  if (valeurs.length < 2) return null

  const marge = 2
  const pas = (largeur - marge * 2) / (valeurs.length - 1)

  const coordonnees = valeurs.map((valeur, index) => {
    const x = marge + index * pas
    const borne = Math.min(100, Math.max(0, valeur))
    const y = marge + (1 - borne / 100) * (hauteur - marge * 2)

    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) }
  })

  const points = coordonnees.map(({ x, y }) => `${x},${y}`).join(' ')
  const dernier = coordonnees.at(-1)

  return (
    <svg
      width={largeur}
      height={hauteur}
      viewBox={`0 0 ${largeur} ${hauteur}`}
      role="img"
      aria-label={titre ?? 'Évolution des notes'}
      className={cn('shrink-0 overflow-visible text-chart-1', className)}
    >
      <line
        x1={marge}
        y1={hauteur / 2}
        x2={largeur - marge}
        y2={hauteur / 2}
        stroke="currentColor"
        strokeWidth={1}
        strokeDasharray="2 3"
        className="text-border"
      />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {tousLesPoints &&
        coordonnees.slice(0, -1).map(({ x, y }, index) => (
          // Deux notes identiques donnent deux points confondus : la position
          // ne peut pas servir de clé, l'indice le peut (liste figée).
          <circle key={index} cx={x} cy={y} r={1.5} fill="currentColor" opacity={0.55} />
        ))}
      {dernier && <circle cx={dernier.x} cy={dernier.y} r={2} fill="currentColor" />}
    </svg>
  )
}
