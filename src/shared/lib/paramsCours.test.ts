import { describe, expect, it } from 'vitest'

import {
  aDesSurcharges,
  parametresEffectifs,
  type ParametresGlobaux,
  type SurchargesCours,
} from '@/shared/lib/paramsCours'
import { NOTATION_PAR_DEFAUT } from '@/shared/lib/rapport'

const GLOBAL: ParametresGlobaux = { ...NOTATION_PAR_DEFAUT, logo: 'logo-du-centre' }

const AUCUNE: SurchargesCours = {
  logo: null,
  assiduite_active: null,
  base_academique: null,
  bareme_assiduite: null,
  penalite_absence: null,
  penalite_retard: null,
  penaliser_absences_excusees: null,
}

function surcharges(extra: Partial<SurchargesCours> = {}): SurchargesCours {
  return { ...AUCUNE, ...extra }
}

describe('parametresEffectifs — héritage', () => {
  it('reprend tout le global quand aucune surcharge n’est posée', () => {
    // C'est la non-régression : un cours d'avant la migration 0011 se comporte
    // exactement comme avant.
    expect(parametresEffectifs(GLOBAL, AUCUNE)).toEqual({
      ...NOTATION_PAR_DEFAUT,
      logo: 'logo-du-centre',
    })
  })

  it('reprend tout le global quand le cours est absent', () => {
    expect(parametresEffectifs(GLOBAL, null)).toEqual({
      ...NOTATION_PAR_DEFAUT,
      logo: 'logo-du-centre',
    })
  })

  it('ne laisse aucun null résiduel hors logo', () => {
    const effectifs = parametresEffectifs({ ...GLOBAL, logo: null }, AUCUNE)

    for (const [cle, valeur] of Object.entries(effectifs)) {
      if (cle === 'logo') continue
      expect(valeur, cle).not.toBeNull()
    }
  })
})

describe('parametresEffectifs — surcharges', () => {
  it('laisse le cours l’emporter champ par champ', () => {
    const effectifs = parametresEffectifs(
      GLOBAL,
      surcharges({ base_academique: 'examen_seul', penalite_retard: 1 })
    )

    expect(effectifs.base_academique).toBe('examen_seul')
    expect(effectifs.penalite_retard).toBe(1)
    // Le reste continue d'être hérité.
    expect(effectifs.penalite_absence).toBe(GLOBAL.penalite_absence)
  })

  it('respecte une surcharge à `false`', () => {
    // Piège du `||` : `false` est une surcharge légitime, pas un « non renseigné ».
    const effectifs = parametresEffectifs(GLOBAL, surcharges({ assiduite_active: false }))

    expect(effectifs.assiduite_active).toBe(false)
  })

  it('respecte une surcharge à `0`', () => {
    const effectifs = parametresEffectifs(
      GLOBAL,
      surcharges({ penalite_absence: 0, bareme_assiduite: 0 })
    )

    expect(effectifs.penalite_absence).toBe(0)
    expect(effectifs.bareme_assiduite).toBe(0)
  })

  it('respecte `penaliser_absences_excusees` à `false` face à un global `true`', () => {
    const effectifs = parametresEffectifs(
      { ...GLOBAL, penaliser_absences_excusees: true },
      surcharges({ penaliser_absences_excusees: false })
    )

    expect(effectifs.penaliser_absences_excusees).toBe(false)
  })
})

describe('parametresEffectifs — part académique', () => {
  it('la déduit toujours de la part d’assiduité', () => {
    expect(parametresEffectifs(GLOBAL, AUCUNE).bareme_academique).toBe(17)
    expect(
      parametresEffectifs(GLOBAL, surcharges({ bareme_assiduite: 5 })).bareme_academique
    ).toBe(15)
  })

  it('garde la somme à 20 même sur une surcharge partielle', () => {
    // Le piège que la déduction supprime : global 17/3 + cours 5 donnerait 22.
    const effectifs = parametresEffectifs(GLOBAL, surcharges({ bareme_assiduite: 5 }))

    expect(effectifs.bareme_academique + effectifs.bareme_assiduite).toBe(20)
  })

  it('donne toute la note à l’examen quand l’assiduité vaut 0', () => {
    const effectifs = parametresEffectifs(GLOBAL, surcharges({ bareme_assiduite: 0 }))

    expect(effectifs.bareme_academique).toBe(20)
  })
})

describe('parametresEffectifs — base académique', () => {
  it('retombe sur le défaut devant une valeur inconnue', () => {
    // La colonne est du `text` : une valeur inattendue ne doit pas fausser un
    // calcul de note.
    const effectifs = parametresEffectifs(
      GLOBAL,
      surcharges({ base_academique: 'devoirs_seuls' })
    )

    expect(effectifs.base_academique).toBe(NOTATION_PAR_DEFAUT.base_academique)
  })
})

describe('parametresEffectifs — logo', () => {
  it('préfère celui du cours', () => {
    expect(parametresEffectifs(GLOBAL, surcharges({ logo: 'logo-du-cours' })).logo).toBe(
      'logo-du-cours'
    )
  })

  it('retombe sur celui du centre', () => {
    expect(parametresEffectifs(GLOBAL, AUCUNE).logo).toBe('logo-du-centre')
  })

  it('reste null quand ni l’un ni l’autre n’en a', () => {
    expect(parametresEffectifs({ ...GLOBAL, logo: null }, AUCUNE).logo).toBeNull()
  })
})

describe('aDesSurcharges', () => {
  it('est faux sans aucune surcharge', () => {
    expect(aDesSurcharges(AUCUNE)).toBe(false)
    expect(aDesSurcharges(null)).toBe(false)
  })

  it('est vrai dès qu’un champ est posé, même à `false`', () => {
    expect(aDesSurcharges(surcharges({ assiduite_active: false }))).toBe(true)
    expect(aDesSurcharges(surcharges({ logo: 'x' }))).toBe(true)
  })
})
