import { describe, expect, test } from 'bun:test'

import { greeting } from './greeting'

describe('greeting', () => {
  test('trims a provided name', () => {
    expect(greeting(' Ada ')).toBe('hello Ada!')
  })

  test('uses the template name for blank input', () => {
    expect(greeting('   ')).toBe('hello hypertextual-svelte!')
  })
})
