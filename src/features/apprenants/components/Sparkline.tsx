export interface SparklineProps {
  /** Valeurs en pourcentage (0–100), dans l'ordre chronologique. */
  valeurs: number[]
  largeur?: number
  hauteur?: number
  titre?: string
}

/**
 * Mini-courbe d'évolution, en SVG pur — aucune dépendance de graphe.
 *
 * L'échelle verticale est **fixée de 0 à 100 %** : une échelle ajustée aux
 * valeurs ferait paraître spectaculaire un écart d'un point. Les données sont
 * déjà en pourcentage, ce qui neutralise le mélange /10 et /20 — tracer les
 * notes brutes donnerait une courbe mensongère.
 */
export function Sparkline({ valeurs, largeur = 120, hauteur = 32, titre }: SparklineProps) {
  // Un point isolé ne dessine pas une évolution.
  if (valeurs.length < 2) return null

  const marge = 2
  const pas = (largeur - marge * 2) / (valeurs.length - 1)

  const points = valeurs
    .map((valeur, index) => {
      const x = marge + index * pas
      const borne = Math.min(100, Math.max(0, valeur))
      const y = marge + (1 - borne / 100) * (hauteur - marge * 2)

      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const dernier = points.split(' ').at(-1)?.split(',') ?? []

  return (
    <svg
      width={largeur}
      height={hauteur}
      viewBox={`0 0 ${largeur} ${hauteur}`}
      role="img"
      aria-label={titre ?? 'Évolution des notes'}
      className="shrink-0 overflow-visible text-chart-1"
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
      {dernier.length === 2 && (
        <circle cx={dernier[0]} cy={dernier[1]} r={2} fill="currentColor" />
      )}
    </svg>
  )
}
