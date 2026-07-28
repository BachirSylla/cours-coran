import { describe, expect, it } from 'vitest'

import {
  LIBELLES_STATUT_SEANCE,
  LIBELLES_TYPE_TRAVAIL,
  seanceSchema,
  STATUTS_SEANCE,
  TYPES_TRAVAIL,
  typeCoursCoranique,
  valeursParDefaut,
} from '@/features/seances/seanceSchema'

function messagePour(donnees: unknown, chemin: string): string | undefined {
  const resultat = seanceSchema.safeParse(donnees)
  if (resultat.success) return undefined
  return resultat.error.issues.find((issue) => issue.path.join('.') === chemin)?.message
}

describe('seanceSchema', () => {
  it('accepte une séance entièrement vide (statut par défaut)', () => {
    const resultat = seanceSchema.parse({})

    expect(resultat.statut).toBe('faite')
    expect(resultat.contenu_aborde).toBeNull()
    expect(resultat.type_travail).toBeNull()
    expect(resultat.versets_de).toBeNull()
  })

  it('transforme les champs texte vides en null', () => {
    const resultat = seanceSchema.parse({
      contenu_aborde: '   ',
      sourate: '',
      exercices_a_faire: '',
      observations: '',
    })

    expect(resultat.contenu_aborde).toBeNull()
    expect(resultat.sourate).toBeNull()
    expect(resultat.exercices_a_faire).toBeNull()
    expect(resultat.observations).toBeNull()
  })

  it('conserve et nettoie les champs renseignés', () => {
    const resultat = seanceSchema.parse({
      contenu_aborde: '  Nourania page 12  ',
      sourate: 'Al-Fatiha',
    })

    expect(resultat.contenu_aborde).toBe('Nourania page 12')
    expect(resultat.sourate).toBe('Al-Fatiha')
  })

  it('accepte les quatre statuts et refuse les autres', () => {
    for (const statut of STATUTS_SEANCE) {
      expect(seanceSchema.safeParse({ statut }).success).toBe(true)
    }

    expect(messagePour({ statut: 'oubliee' }, 'statut')).toBe('Statut invalide.')
  })

  it('accepte les trois types de travail, vide, ou rien', () => {
    for (const type of TYPES_TRAVAIL) {
      expect(seanceSchema.parse({ type_travail: type }).type_travail).toBe(type)
    }

    expect(seanceSchema.parse({ type_travail: '' }).type_travail).toBeNull()
    expect(seanceSchema.parse({}).type_travail).toBeNull()
    expect(seanceSchema.safeParse({ type_travail: 'tajweed' }).success).toBe(false)
  })

  it('convertit les versets en entiers', () => {
    const resultat = seanceSchema.parse({ versets_de: '1', versets_a: '7' })

    expect(resultat.versets_de).toBe(1)
    expect(resultat.versets_a).toBe(7)
  })

  it('refuse un verset nul, négatif ou décimal', () => {
    expect(messagePour({ versets_de: '0' }, 'versets_de')).toMatch(
      /entier supérieur ou égal à 1/
    )
    expect(messagePour({ versets_de: '-3' }, 'versets_de')).toMatch(/entier/)
    expect(messagePour({ versets_de: '2.5' }, 'versets_de')).toMatch(/entier/)
    expect(messagePour({ versets_de: 'abc' }, 'versets_de')).toMatch(/entier/)
  })

  it('refuse un verset de fin inférieur au verset de début', () => {
    expect(messagePour({ versets_de: '10', versets_a: '5' }, 'versets_a')).toBe(
      'Le verset de fin doit être supérieur ou égal au verset de début.'
    )
  })

  it('accepte deux versets égaux (un seul verset travaillé)', () => {
    expect(seanceSchema.safeParse({ versets_de: '5', versets_a: '5' }).success).toBe(true)
  })

  it('accepte un seul des deux versets renseigné', () => {
    expect(seanceSchema.safeParse({ versets_de: '5' }).success).toBe(true)
    expect(seanceSchema.safeParse({ versets_a: '5' }).success).toBe(true)
  })

  it('ne compare pas les versets quand l’un est invalide', () => {
    // Le message doit porter sur le champ fautif, pas sur la cohérence.
    expect(messagePour({ versets_de: '0', versets_a: '5' }, 'versets_a')).toBeUndefined()
  })

  it('refuse un contenu trop long', () => {
    expect(messagePour({ contenu_aborde: 'a'.repeat(2001) }, 'contenu_aborde')).toMatch(
      /2000 caractères/
    )
  })

  it('produit des valeurs par défaut valides', () => {
    expect(seanceSchema.safeParse(valeursParDefaut()).success).toBe(true)
  })

  it('a un libellé français pour chaque statut et chaque type de travail', () => {
    for (const statut of STATUTS_SEANCE) expect(LIBELLES_STATUT_SEANCE[statut]).toBeTruthy()
    for (const type of TYPES_TRAVAIL) expect(LIBELLES_TYPE_TRAVAIL[type]).toBeTruthy()
  })
})

describe('typeCoursCoranique', () => {
  it('reconnaît la lecture et la mémorisation', () => {
    expect(typeCoursCoranique('Lecture du Coran')).toBe(true)
    expect(typeCoursCoranique('Mémorisation')).toBe(true)
    expect(typeCoursCoranique('memorisation')).toBe(true)
  })

  it('ne déplie pas le bloc pour l’initiation, malgré le mot « lecture »', () => {
    expect(typeCoursCoranique('Initiation à la lecture du Coran')).toBe(false)
    expect(typeCoursCoranique('Initiation Nourania')).toBe(false)
  })

  it('reste discret quand le type est inconnu', () => {
    expect(typeCoursCoranique(null)).toBe(false)
    expect(typeCoursCoranique(undefined)).toBe(false)
    expect(typeCoursCoranique('')).toBe(false)
  })
})
