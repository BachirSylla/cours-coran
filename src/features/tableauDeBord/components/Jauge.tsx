import { cn } from '@/shared/lib/utils'

export interface JaugeProps {
  /** 0–100, ou `null` quand la valeur n'a pas de sens (rien à mesurer). */
  valeur: number | null
  libelle: string
  /** Ce qui s'affiche à la place du pourcentage quand `valeur` est `null`. */
  vide?: string
  taille?: number
  className?: string
}

/**
 * Anneau de progression — SVG pur, aucune dépendance de graphe.
 *
 * ⚠️ `valeur` à `null` n'est PAS zéro. Un centre neuf afficherait « 0 % » de
 * recouvrement ou d'assiduité : un mauvais bulletin pour quelqu'un qui n'a
 * encore rien fait de mal. L'anneau reste alors vide et le chiffre laisse place
 * à un tiret.
 *
 * La couleur suit un **seuil**, pas un dégradé continu : trois paliers se lisent
 * d'un coup d'œil là où un dégradé demande de comparer des nuances.
 */
export function Jauge({ valeur, libelle, vide = '—', taille = 92, className }: JaugeProps) {
  const rayon = taille / 2 - 8
  const circonference = 2 * Math.PI * rayon
  const part = valeur === null ? 0 : Math.min(100, Math.max(0, valeur))

  const teinte =
    valeur === null
      ? 'var(--color-border)'
      : part >= 80
        ? 'var(--color-primary)'
        : part >= 50
          ? 'var(--color-chart-4)'
          : 'var(--color-destructive)'

  return (
    <div className={cn('flex flex-col items-center gap-1.5', className)}>
      <div className="relative" style={{ width: taille, height: taille }}>
        <svg
          viewBox={`0 0 ${taille} ${taille}`}
          className="size-full -rotate-90"
          role="img"
          aria-label={`${libelle} : ${valeur === null ? 'non mesurable' : `${part} %`}`}
        >
          <circle
            cx={taille / 2}
            cy={taille / 2}
            r={rayon}
            fill="none"
            stroke="var(--color-muted)"
            strokeWidth="7"
          />
          <circle
            cx={taille / 2}
            cy={taille / 2}
            r={rayon}
            fill="none"
            stroke={teinte}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circonference}
            strokeDashoffset={circonference * (1 - part / 100)}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        </svg>

        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-semibold tabular-nums">
            {valeur === null ? vide : `${part}%`}
          </span>
        </div>
      </div>

      <span className="text-center text-xs text-muted-foreground">{libelle}</span>
    </div>
  )
}
