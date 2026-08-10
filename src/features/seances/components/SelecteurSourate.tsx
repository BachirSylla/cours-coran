import { useState } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'

import {
  chercherSourates,
  libelleSourate,
  trouverParNumero,
  type Sourate,
} from '@/shared/data/sourates'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'

export interface SelecteurSourateProps {
  /** Numéro sélectionné, ou `null` : le champ reste facultatif. */
  valeur: number | null
  /** Reçoit la sourate complète (numéro + nom canonique), ou `null` si effacé. */
  onChange: (sourate: Sourate | null) => void
  /**
   * Texte enregistré avant l'existence du numéro, quand il n'a pas pu être
   * rapproché d'une sourate connue. Affiché pour ne pas escamoter la saisie.
   */
  texteOrphelin?: string | null
  id?: string
}

/**
 * Sélection d'une sourate parmi les 114, recherchable par numéro, nom
 * translittéré (sans accent ni tiret) ou nom arabe.
 *
 * Le filtrage de cmdk est désactivé (`shouldFilter={false}`) : il ne sait ni
 * chercher par numéro, ni plier les accents comme `chercherSourates`.
 */
export function SelecteurSourate({
  valeur,
  onChange,
  texteOrphelin,
  id,
}: SelecteurSourateProps) {
  const [ouvert, setOuvert] = useState(false)
  const [requete, setRequete] = useState('')

  const selectionnee = trouverParNumero(valeur)
  const resultats = chercherSourates(requete)

  return (
    <div className="space-y-1">
      <Popover
        open={ouvert}
        onOpenChange={(nouvelEtat) => {
          setOuvert(nouvelEtat)
          if (!nouvelEtat) setRequete('')
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={ouvert}
            aria-label="Choisir une sourate"
            className="w-full justify-between font-normal"
          >
            <span className={cn('truncate', !selectionnee && 'text-muted-foreground')}>
              {selectionnee ? libelleSourate(selectionnee) : 'Choisir une sourate…'}
            </span>
            <ChevronsUpDown
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Numéro, nom ou nom arabe…"
              value={requete}
              onValueChange={setRequete}
            />
            <CommandList>
              <CommandEmpty>Aucune sourate trouvée.</CommandEmpty>

              {selectionnee && (
                <CommandGroup>
                  <CommandItem
                    value="__effacer"
                    onSelect={() => {
                      onChange(null)
                      setOuvert(false)
                    }}
                  >
                    <X className="size-4" aria-hidden="true" />
                    Effacer la sélection
                  </CommandItem>
                </CommandGroup>
              )}

              <CommandGroup>
                {resultats.map((sourate) => (
                  <CommandItem
                    key={sourate.numero}
                    value={String(sourate.numero)}
                    onSelect={() => {
                      onChange(sourate)
                      setOuvert(false)
                    }}
                  >
                    <Check
                      className={cn(
                        'size-4',
                        sourate.numero === valeur ? 'opacity-100' : 'opacity-0'
                      )}
                      aria-hidden="true"
                    />
                    <span className="flex-1 truncate">{libelleSourate(sourate)}</span>
                    <span className="shrink-0 text-sm text-muted-foreground" dir="rtl">
                      {sourate.nomArabe}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {!selectionnee && texteOrphelin && (
        <p className="text-xs text-muted-foreground">
          Saisie précédente : « {texteOrphelin} » — choisissez une sourate pour la remplacer.
        </p>
      )}
    </div>
  )
}
