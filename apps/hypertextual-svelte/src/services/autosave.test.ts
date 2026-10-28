import { describe, expect, test } from 'bun:test'
import { Autosave, type SaveState } from './autosave'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

// unit ------------------------------------------------------------------------

describe('autosave lifecycle', () => {
  test('initial content and unchanged edits never write', async () => {
    let writes = 0
    const saver = new Autosave(
      'original',
      'r0',
      async () => {
        writes++
        return 'r1'
      },
      () => {},
    )
    saver.update('original')
    expect(await saver.flush()).toBe(true)
    expect(writes).toBe(0)
    saver.dispose()
  })

  test('can persist filename metadata once without editing source bytes', async () => {
    const writes: string[] = []
    const saver = new Autosave(
      'original',
      'r0',
      async (source) => {
        writes.push(source)
        return 'r1'
      },
      () => {},
    )
    expect(await saver.requestSave()).toBe(true)
    expect(await saver.flush()).toBe(true)
    expect(writes).toEqual(['original'])
    expect(saver.dirty).toBe(false)
    saver.dispose()
  })

  test('metadata failures remain dirty and can be retried', async () => {
    let attempts = 0
    const saver = new Autosave(
      'original',
      'r0',
      async (source, revision) => {
        expect(source).toBe('original')
        expect(revision).toBe('r0')
        if (++attempts === 1) throw new Error('Cannot rename file')
        return 'r1'
      },
      () => {},
    )
    expect(await saver.requestSave()).toBe(false)
    expect(saver.dirty).toBe(true)
    expect(await saver.flush()).toBe(true)
    expect(attempts).toBe(2)
    expect(saver.dirty).toBe(false)
    saver.dispose()
  })

  test('serializes rapid edits and drains before a switch/close', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const writes: { source: string; revision: string }[] = []
    const states: SaveState[] = []
    const saver = new Autosave(
      'original',
      'r0',
      (source, revision) => {
        writes.push({ source, revision })
        return writes.length === 1 ? first.promise : second.promise
      },
      (state) => states.push(state),
      60_000,
    )
    saver.update('first')
    const drained = saver.flush()
    saver.update('second')
    saver.update('latest')
    expect(writes).toEqual([{ source: 'first', revision: 'r0' }])
    expect(saver.flush()).toBe(drained)
    first.resolve('r1')
    await Promise.resolve()
    expect(writes[1]).toEqual({ source: 'latest', revision: 'r1' })
    expect(states.at(-1)?.status).toBe('saving')
    second.resolve('r2')
    expect(await drained).toBe(true)
    expect(saver.dirty).toBe(false)
    expect(states.at(-1)?.status).toBe('saved')
    saver.dispose()
  })

  test('failed writes retain the draft and retry against the same revision', async () => {
    const writes: string[] = []
    const states: SaveState[] = []
    let fail = true
    const saver = new Autosave(
      'original',
      'r0',
      async (source, revision) => {
        expect(revision).toBe('r0')
        writes.push(source)
        if (fail) throw { code: 'conflict', message: 'Changed outside the app' }
        return 'r1'
      },
      (state) => states.push(state),
    )
    saver.update('draft')
    expect(await saver.flush()).toBe(false)
    expect(saver.dirty).toBe(true)
    expect(states.at(-1)).toEqual({ status: 'error', error: 'Changed outside the app' })
    fail = false
    expect(await saver.flush()).toBe(true)
    expect(writes).toEqual(['draft', 'draft'])
    saver.dispose()
  })

  test('debounces edits instead of requiring explicit save', async () => {
    const done = deferred<string>()
    const writes: string[] = []
    const saver = new Autosave(
      '',
      'r0',
      async (source) => {
        writes.push(source)
        done.resolve(source)
        return 'r1'
      },
      () => {},
      5,
    )
    saver.update('a')
    saver.update('ab')
    saver.update('abc')
    expect(await done.promise).toBe('abc')
    expect(writes).toEqual(['abc'])
    await saver.flush()
    saver.dispose()
  })
})

test('discarding a draft waits for an in-flight write and cancels queued edits', async () => {
  const pending = deferred<string>()
  const writes: string[] = []
  const saver = new Autosave(
    'original',
    'r0',
    (source) => {
      writes.push(source)
      return pending.promise
    },
    () => {},
    60_000,
  )
  saver.update('in flight')
  const saved = saver.flush()
  saver.update('discard this queued edit')
  let discarded = false
  const discard = saver.discard().then(() => {
    discarded = true
  })
  await Promise.resolve()
  expect(discarded).toBe(false)
  pending.resolve('r1')
  await saved
  await discard
  expect(writes).toEqual(['in flight'])
  expect(saver.dirty).toBe(false)
})
