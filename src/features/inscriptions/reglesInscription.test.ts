import { describe, expect, it } from 'vitest'

import {
  CAPACITE_INDIVIDUEL,
  capaciteAtteinte,
  messageFormatIncompatible,
  messageRefus,
  peutAjouterInscription,
  peutPasserEnIndividuel,
} from '@/features/inscriptions/reglesInscription'

describe('capaciteAtteinte', () => {
  it('un cours individuel est plein dès le premier inscrit', () => {
    expect(capaciteAtteinte('individuel', 0)).toBe(false)
    expect(capaciteAtteinte('individuel', 1)).toBe(true)
    expect(capaciteAtteinte('individuel', 2)).toBe(true)
  })

  it('un cours de groupe n’est jamais plein', () => {
    expect(capaciteAtteinte('groupe', 0)).toBe(false)
    expect(capaciteAtteinte('groupe', 1)).toBe(false)
    expect(capaciteAtteinte('groupe', 42)).toBe(false)
  })
})

describe('peutAjouterInscription', () => {
  it('autorise le premier apprenant d’un cours individuel', () => {
    expect(peutAjouterInscription('individuel', 0)).toEqual({ autorise: true })
  })

  it('refuse le deuxième apprenant d’un cours individuel', () => {
    expect(peutAjouterInscription('individuel', 1)).toEqual({
      autorise: false,
      raison: 'complet',
    })
  })

  it('autorise autant d’apprenants qu’on veut dans un groupe', () => {
    for (const nb of [0, 1, 5, 30]) {
      expect(peutAjouterInscription('groupe', nb)).toEqual({ autorise: true })
    }
  })

  it('refuse un apprenant déjà inscrit, quel que soit le format', () => {
    expect(peutAjouterInscription('groupe', 3, true)).toEqual({
      autorise: false,
      raison: 'deja_inscrit',
    })
    expect(peutAjouterInscription('individuel', 0, true)).toEqual({
      autorise: false,
      raison: 'deja_inscrit',
    })
  })

  it('signale le doublon en priorité sur la capacité', () => {
    // Cours individuel plein ET apprenant déjà inscrit : le message le plus
    // précis est celui du doublon.
    expect(peutAjouterInscription('individuel', 1, true).raison).toBe('deja_inscrit')
  })
})

describe('peutPasserEnIndividuel', () => {
  it('accepte un cours vide ou à un seul inscrit', () => {
    expect(peutPasserEnIndividuel(0)).toBe(true)
    expect(peutPasserEnIndividuel(CAPACITE_INDIVIDUEL)).toBe(true)
  })

  it('refuse dès deux inscrits', () => {
    expect(peutPasserEnIndividuel(2)).toBe(false)
    expect(peutPasserEnIndividuel(10)).toBe(false)
  })
})

describe('messages', () => {
  it('explique le refus en français', () => {
    expect(messageRefus('deja_inscrit')).toBe('Cet apprenant est déjà inscrit à ce cours.')
    expect(messageRefus('complet')).toMatch(/un seul apprenant/)
  })

  it('indique combien d’apprenants retirer avant de passer en individuel', () => {
    expect(messageFormatIncompatible(3)).toBe(
      'Ce cours compte 3 apprenants : retirez-en 2 avant de le passer en individuel.'
    )
    expect(messageFormatIncompatible(2)).toMatch(/retirez-en 1/)
  })
})
