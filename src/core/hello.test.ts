import { describe, it, expect } from 'vitest'

// Premier test de validation : Vitest fonctionne et le core est testable.
describe('core bootstrap', () => {
  it('1 + 1 vaut 2 (sanity check Vitest)', () => {
    expect(1 + 1).toBe(2)
  })

  it('additionne deux nombres positifs', () => {
    const add = (a: number, b: number): number => a + b
    expect(add(3, 4)).toBe(7)
  })
})
