import { expect, test } from 'bun:test'
import { greet } from './index.js'

test('greets a named user', () => {
  const message: string = greet('Premise')
  expect(message).toBe('Hello, Premise!')
})
