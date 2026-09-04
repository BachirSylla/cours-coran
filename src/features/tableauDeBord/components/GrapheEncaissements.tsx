import { useId, useState } from 'react'

import { formaterMontant, libelleMois } from '@/shared/lib/paiements'
import type { PointEncaissement } from '@/shared/lib/tableauDeBord'
import { cn } from '@/shared/lib/utils'

export interface GrapheEncaissementsProps {
  points: PointEncaissement[]
  devise: string
  className?: string
}

const HAUTEUR = 132
const LARGEUR = 420
const MARGE_HAUT = 14
const MARGE_BAS = 22

/**
 * Encaissements mois par mois — SVG pur, aucune dépendance de graphe.
 *
 * Des **barres**, et non une courbe : une trésorerie mensuelle est une suite de
 * quantités indépendantes, pas une grandeur continue. Une ligne suggérerait
 * qu'il s'est passé quelque chose entre deux mois, et interpolerait un montant
 * qui n'existe pas.
 *
 * ⚠️ L'échelle part **toujours de zéro**. Une échelle ajustée au minimum ferait
 * paraître un écart de 5 % comme un effondrement — c'est la façon la plus
 * courante de mentir avec un graphe, et sur de l'argent elle ne pardonne pas.
 *
 * Le `viewBox` porte toute la mise à l'échelle : le tracé est fluide, la
 * typographie reste lisible parce qu'elle est rendue hors du SVG, dans
 * l'infobulle.
 */
export function GrapheEncaissements({ points, devise, className }: GrapheEncaissementsProps) {
  const [survole, setSurvole] = useState<number | null>(null)
  const degrade = useId()

  if (points.length === 0) return null

  const maximum = Math.max(...points.map((point) => point.montant))
  const utile = HAUTEUR - MARGE_HAUT - MARGE_BAS
  const pas = LARGEUR / points.length
  const largeurBarre = Math.min(pas * 0.56, 34)

  // Tout à zéro : on dessine le socle, pas des barres de hauteur nulle qui
  // ressembleraient à un bug d'affichage.
  const hauteurDe = (montant: number) =>
    maximum === 0 ? 0 : Math.max(2, (montant / maximum) * utile)

  const actif = survole === null ? null : points[survole]

  return (
    <div className={cn('relative', className)}>
      <svg
        viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={`Encaissements des ${points.length} derniers mois`}
        onMouseLeave={() => setSurvole(null)}
      >
        {/*
          ⚠️ Les valeurs, en toutes lettres, pour qui n'a pas de souris. Un
          `role="img"` sans description ne dit qu'un titre : le contenu du graphe
          serait alors inaccessible au lecteur d'écran, et l'infobulle de survol
          l'est déjà au doigt.
        */}
        <desc>
          {points
            .map((point) => `${libelleMois(point.mois)} : ${formaterMontant(point.montant, devise)}`)
            .join(' — ')}
        </desc>

        <defs>
          <linearGradient id={degrade} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.45" />
          </linearGradient>
        </defs>

        {/* Le socle : sans lui, des barres nulles flottent sans repère. */}
        <line
          x1="0"
          y1={HAUTEUR - MARGE_BAS}
          x2={LARGEUR}
          y2={HAUTEUR - MARGE_BAS}
          stroke="var(--color-border)"
          strokeWidth="1"
        />

        {points.map((point, index) => {
          const hauteur = hauteurDe(point.montant)
          const x = index * pas + (pas - largeurBarre) / 2
          const y = HAUTEUR - MARGE_BAS - hauteur
          const enAvant = survole === index

          return (
            <g key={point.mois}>
              {/*
                Zone active pleine hauteur : viser une barre basse au pixel près
                serait impossible au doigt. Focusable et cliquable, pour que le
                détail soit atteignable au clavier et au toucher — le survol seul
                exclut la moitié des usages sur un écran mobile-first.
              */}
              <rect
                x={index * pas}
                y="0"
                width={pas}
                height={HAUTEUR}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`${libelleMois(point.mois)} : ${formaterMontant(point.montant, devise)}`}
                className="cursor-pointer outline-none focus-visible:fill-primary/10"
                onMouseEnter={() => setSurvole(index)}
                onFocus={() => setSurvole(index)}
                onBlur={() => setSurvole(null)}
                onClick={() => setSurvole(index)}
              />
              <rect
                x={x}
                y={y}
                width={largeurBarre}
                height={hauteur}
                rx="3"
                fill={`url(#${degrade})`}
                className={cn(
                  'transition-opacity duration-200',
                  survole !== null && !enAvant && 'opacity-40'
                )}
              />
              <text
                x={index * pas + pas / 2}
                y={HAUTEUR - 6}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {libelleMois(point.mois).slice(0, 3)}
              </text>
            </g>
          )
        })}
      </svg>

      {/*
        L'infobulle vit HORS du SVG : un `<text>` mis à l'échelle par le viewBox
        deviendrait illisible sur mobile et grotesque sur grand écran.
      */}
      <p
        aria-live="polite"
        className="mt-1 h-5 text-center text-xs text-muted-foreground tabular-nums"
      >
        {actif
          ? `${libelleMois(actif.mois)} · ${formaterMontant(actif.montant, devise)}`
          : `Total ${formaterMontant(
              points.reduce((total, point) => total + point.montant, 0),
              devise
            )}`}
      </p>
    </div>
  )
}
