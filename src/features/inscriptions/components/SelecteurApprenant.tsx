import { useState } from 'react'
import { Check, ChevronsUpDown, UserPlus } from 'lucide-react'

import type { Apprenant } from '@/shared/supabase/apprenantRepo'
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

export interface SelecteurApprenantProps {
  /** Apprenants proposables : les déjà-inscrits en sont retirés par l'appelant. */
  apprenants: Apprenant[]
  onChoisir: (apprenantId: string) => void
  desactive?: boolean
  enCours?: boolean
}

/** Recherche d'un apprenant par nom ou prénom, pour l'inscrire à un cours. */
export function SelecteurApprenant({
  apprenants,
  onChoisir,
  desactive = false,
  enCours = false,
}: SelecteurApprenantProps) {
  const [ouvert, setOuvert] = useState(false)

  return (
    <Popover open={ouvert} onOpenChange={setOuvert}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={ouvert}
          // Nom accessible explicite : le contenu du bouton est composé
          // d'icônes décoratives et d'un libellé, la déduction n'est pas fiable.
          aria-label="Inscrire un apprenant"
          disabled={desactive || enCours}
        >
          <UserPlus className="size-4" aria-hidden="true" />
          Inscrire un apprenant
          <ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Rechercher par nom…" />
          <CommandList>
            <CommandEmpty>Aucun apprenant disponible.</CommandEmpty>
            <CommandGroup>
              {apprenants.map((apprenant) => {
                const nomComplet = `${apprenant.prenom} ${apprenant.nom}`

                return (
                  <CommandItem
                    key={apprenant.id}
                    // `value` alimente la recherche de cmdk : on y met le nom,
                    // pas l'identifiant, sinon la saisie ne filtrerait rien.
                    value={nomComplet}
                    onSelect={() => {
                      onChoisir(apprenant.id)
                      setOuvert(false)
                    }}
                  >
                    <Check className="size-4 opacity-0" aria-hidden="true" />
                    <span className="flex-1 truncate">{nomComplet}</span>
                    {apprenant.niveau && (
                      <span className="text-xs text-muted-foreground">{apprenant.niveau}</span>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
