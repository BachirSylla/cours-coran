import { describe, expect, it } from 'vitest'

import { cn } from '@/shared/lib/utils'

describe('cn', () => {
  it('concatène plusieurs classes', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1')
  })

  it('ignore les valeurs conditionnelles fausses', () => {
    const estMasque = false
    expect(cn('px-2', estMasque && 'hidden', undefined, null, 'py-1')).toBe('px-2 py-1')
  })

  it('laisse la dernière classe Tailwind écraser la précédente', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('text-sm text-muted-foreground', 'text-foreground')).toBe(
      'text-sm text-foreground'
    )
  })
})
