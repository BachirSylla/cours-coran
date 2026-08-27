import { useState } from 'react'
import {
  ChevronDown,
  ImagePlus,
  Loader2,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
} from 'lucide-react'

import { useDefinirReglagesCours } from '@/features/cours/hooks/useDefinirReglagesCours'
import { useParametres } from '@/features/parametres/hooks/useParametres'
import { redimensionnerLogo, TYPES_ACCEPTES } from '@/features/parametres/logo'
import type { SurchargesCours } from '@/shared/lib/paramsCours'
import {
  BASES_ACADEMIQUES,
  estBaseAcademique,
  LIBELLES_BASE_ACADEMIQUE,
  NOTATION_PAR_DEFAUT,
  type BaseAcademique,
} from '@/shared/lib/rapport'
import { cn } from '@/shared/lib/utils'
import type { CoursAvecDetails } from '@/shared/supabase/coursRepo'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { SelectNatif } from '@/shared/ui/SelectNatif'

export interface SectionReglagesCoursProps {
  cours: CoursAvecDetails
}

/** `''` dans le formulaire signifie « hériter » — c'est-à-dire `null` en base. */
interface Saisie {
  assiduite_active: string
  base_academique: string
  bareme_assiduite: string
  penalite_absence: string
  penalite_retard: string
  penaliser_absences_excusees: string
}

function nombreOuNull(valeur: string): number | null {
  const texte = valeur.trim().replace(',', '.')
  if (texte === '') return null

  const nombre = Number(texte)
  return Number.isFinite(nombre) ? nombre : null
}

function booleenOuNull(valeur: string): boolean | null {
  return valeur === '' ? null : valeur === 'oui'
}

function versSaisie(cours: CoursAvecDetails): Saisie {
  const texte = (valeur: number | null) =>
    valeur === null ? '' : String(valeur).replace('.', ',')
  const bool = (valeur: boolean | null) => (valeur === null ? '' : valeur ? 'oui' : 'non')

  return {
    assiduite_active: bool(cours.assiduite_active),
    base_academique: cours.base_academique ?? '',
    bareme_assiduite: texte(cours.bareme_assiduite),
    penalite_absence: texte(cours.penalite_absence),
    penalite_retard: texte(cours.penalite_retard),
    penaliser_absences_excusees: bool(cours.penaliser_absences_excusees),
  }
}

/**
 * Réglages de notation et logo **propres à un cours**, au-dessus de ceux du
 * centre.
 *
 * Un champ vide signifie « hériter » : son placeholder montre alors la valeur
 * du centre qui s'appliquera. C'est ce qui rend la section lisible sans avoir à
 * ouvrir les Paramètres en parallèle.
 *
 * Elle vit dans le détail du cours, et non dans son formulaire d'édition :
 * `enregistrer_cours` (migration 0002) énumère ses colonnes et porte le
 * garde-fou de la règle de conflit — on ne la touche pas pour un réglage
 * d'affichage.
 */
export function SectionReglagesCours({ cours }: SectionReglagesCoursProps) {
  const { data: parametres } = useParametres()
  const enregistrer = useDefinirReglagesCours()

  const [ouvert, setOuvert] = useState(false)
  const [saisie, setSaisie] = useState<Saisie>(() => versSaisie(cours))
  const [refusLogo, setRefusLogo] = useState<string | null>(null)
  const [prepare, setPrepare] = useState(false)

  const centre = parametres ?? { ...NOTATION_PAR_DEFAUT, note_bareme: 20, logo: null }

  function modifier(champ: keyof Saisie, valeur: string) {
    setSaisie((precedente) => ({ ...precedente, [champ]: valeur }))
  }

  function surchargesSaisies(): SurchargesCours {
    const base = saisie.base_academique

    return {
      logo: cours.logo,
      assiduite_active: booleenOuNull(saisie.assiduite_active),
      base_academique: estBaseAcademique(base) ? base : null,
      bareme_assiduite: nombreOuNull(saisie.bareme_assiduite),
      penalite_absence: nombreOuNull(saisie.penalite_absence),
      penalite_retard: nombreOuNull(saisie.penalite_retard),
      penaliser_absences_excusees: booleenOuNull(saisie.penaliser_absences_excusees),
    }
  }

  async function choisirLogo(fichier: File | undefined) {
    setRefusLogo(null)
    if (!fichier) return

    setPrepare(true)
    try {
      const logo = await redimensionnerLogo(fichier)
      await enregistrer.mutateAsync({
        coursId: cours.id,
        surcharges: { ...surchargesSaisies(), logo },
      })
    } catch (erreur) {
      setRefusLogo(
        erreur instanceof Error ? erreur.message : "Ce fichier n'a pas pu être utilisé."
      )
    } finally {
      setPrepare(false)
    }
  }

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setOuvert((precedent) => !precedent)}
        aria-expanded={ouvert}
        className="flex w-full items-center gap-2 text-left text-sm font-medium"
      >
        <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden="true" />
        Réglages spécifiques
        <span className="font-normal text-muted-foreground">(sinon : réglages du centre)</span>
        <ChevronDown
          className={cn('ml-auto size-4 transition-transform', ouvert && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {ouvert && (
        <div className="space-y-4 rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">
            Laissez un champ vide pour hériter du centre. Le texte grisé montre la valeur qui
            s'appliquera alors.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`assiduite-${cours.id}`}>Appliquer l'assiduité</Label>
              <SelectNatif
                id={`assiduite-${cours.id}`}
                className="w-full"
                value={saisie.assiduite_active}
                onChange={(evenement) =>
                  modifier('assiduite_active', evenement.currentTarget.value)
                }
              >
                <option value="">Hérité : {centre.assiduite_active ? 'oui' : 'non'}</option>
                <option value="oui">Oui</option>
                <option value="non">Non — la note finale vient de l'examen seul</option>
              </SelectNatif>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`base-${cours.id}`}>Base de la note académique</Label>
              <SelectNatif
                id={`base-${cours.id}`}
                className="w-full"
                value={saisie.base_academique}
                onChange={(evenement) =>
                  modifier('base_academique', evenement.currentTarget.value)
                }
              >
                <option value="">
                  Hérité : {LIBELLES_BASE_ACADEMIQUE[centre.base_academique as BaseAcademique]}
                </option>
                {BASES_ACADEMIQUES.map((base) => (
                  <option key={base} value={base}>
                    {LIBELLES_BASE_ACADEMIQUE[base]}
                  </option>
                ))}
              </SelectNatif>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`assid-max-${cours.id}`}>Part de l'assiduité</Label>
              <Input
                id={`assid-max-${cours.id}`}
                inputMode="numeric"
                placeholder={`Hérité : ${centre.bareme_assiduite}`}
                value={saisie.bareme_assiduite}
                onChange={(evenement) =>
                  modifier('bareme_assiduite', evenement.currentTarget.value)
                }
              />
              {/* La part académique n'est jamais saisie : elle est ce qui reste. */}
              <p className="text-xs text-muted-foreground">
                l'examen prend les points restants sur 20
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`excusees-${cours.id}`}>Absences excusées</Label>
              <SelectNatif
                id={`excusees-${cours.id}`}
                className="w-full"
                value={saisie.penaliser_absences_excusees}
                onChange={(evenement) =>
                  modifier('penaliser_absences_excusees', evenement.currentTarget.value)
                }
              >
                <option value="">
                  Hérité :{' '}
                  {centre.penaliser_absences_excusees ? 'pénalisées' : 'non pénalisées'}
                </option>
                <option value="non">Non pénalisées</option>
                <option value="oui">Pénalisées</option>
              </SelectNatif>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`pen-abs-${cours.id}`}>Pénalité par absence</Label>
              <Input
                id={`pen-abs-${cours.id}`}
                inputMode="decimal"
                placeholder={`Hérité : ${String(centre.penalite_absence).replace('.', ',')}`}
                value={saisie.penalite_absence}
                onChange={(evenement) =>
                  modifier('penalite_absence', evenement.currentTarget.value)
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`pen-ret-${cours.id}`}>Pénalité par retard</Label>
              <Input
                id={`pen-ret-${cours.id}`}
                inputMode="decimal"
                placeholder={`Hérité : ${String(centre.penalite_retard).replace('.', ',')}`}
                value={saisie.penalite_retard}
                onChange={(evenement) =>
                  modifier('penalite_retard', evenement.currentTarget.value)
                }
              />
            </div>
          </div>

          <div className="space-y-2 border-t pt-3">
            <Label htmlFor={`logo-${cours.id}`}>Logo du cours</Label>

            {cours.logo ? (
              <img
                src={cours.logo}
                alt="Logo du cours"
                className="h-[46px] w-auto max-w-[150px] rounded border bg-background object-contain p-1"
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                {centre.logo
                  ? 'Hérité : le logo du centre.'
                  : 'Aucun logo — ni pour ce cours, ni pour le centre.'}
              </p>
            )}

            <input
              id={`logo-${cours.id}`}
              type="file"
              accept={TYPES_ACCEPTES.join(',')}
              aria-label="Choisir un logo pour ce cours"
              className="hidden"
              onChange={(evenement) => void choisirLogo(evenement.currentTarget.files?.[0])}
            />

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={prepare || enregistrer.isPending}
                onClick={() => document.getElementById(`logo-${cours.id}`)?.click()}
              >
                {prepare ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ImagePlus className="size-4" aria-hidden="true" />
                )}
                {cours.logo ? 'Remplacer' : 'Choisir un logo'}
              </Button>

              {cours.logo && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={prepare || enregistrer.isPending}
                  onClick={() =>
                    enregistrer.mutate({
                      coursId: cours.id,
                      surcharges: { ...surchargesSaisies(), logo: null },
                    })
                  }
                >
                  <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                  Revenir au logo du centre
                </Button>
              )}
            </div>
          </div>

          {refusLogo && (
            <Alert variant="destructive">
              <TriangleAlert className="size-4" aria-hidden="true" />
              <AlertDescription>{refusLogo}</AlertDescription>
            </Alert>
          )}

          {enregistrer.isError && (
            <Alert variant="destructive">
              <TriangleAlert className="size-4" aria-hidden="true" />
              <AlertDescription>{enregistrer.error.message}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center gap-3">
            <Button
              type="button"
              size="sm"
              disabled={enregistrer.isPending || prepare}
              onClick={() =>
                enregistrer.mutate({ coursId: cours.id, surcharges: surchargesSaisies() })
              }
            >
              {enregistrer.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              Enregistrer les réglages
            </Button>

            {enregistrer.isSuccess && (
              <span className="text-xs text-muted-foreground">Réglages enregistrés.</span>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
