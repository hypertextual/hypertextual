import { describe, expect, it, mock } from 'bun:test'
import {
  DefaultEmbeddedEditorRegistry,
  defineEditorExtension,
  isUntitledFormatFile,
  matchesFormatExtension,
  matchesKeyBinding,
  stripFormatExtension,
} from './index.js'
import type { Editor } from './types.js'

function createFakeElement(name: string) {
  return { name } as unknown as HTMLElement
}

function makeKeyEvent(
  key: string,
  options?: {
    ctrlKey?: boolean
    metaKey?: boolean
    altKey?: boolean
    shiftKey?: boolean
  },
): KeyboardEvent {
  return {
    key,
    ctrlKey: Boolean(options?.ctrlKey),
    metaKey: Boolean(options?.metaKey),
    altKey: Boolean(options?.altKey),
    shiftKey: Boolean(options?.shiftKey),
    isComposing: false,
    preventDefault: mock(() => {}),
    stopPropagation: mock(() => {}),
  } as unknown as KeyboardEvent
}

// unit ----------------------------------------------------------------------

describe('matchesKeyBinding', () => {
  it('supports plain keys and Mod-key normalization for Meta and Control shortcuts', () => {
    expect(matchesKeyBinding(makeKeyEvent('Escape'), 'Escape')).toBe(true)
    expect(matchesKeyBinding(makeKeyEvent('a'), 'a')).toBe(true)
    expect(matchesKeyBinding(makeKeyEvent('a'), 'A')).toBe(false)
    expect(matchesKeyBinding(makeKeyEvent('b', { metaKey: true }), 'Mod-b')).toBe(true)
    expect(matchesKeyBinding(makeKeyEvent('b', { ctrlKey: true }), 'Mod-b')).toBe(true)
    expect(matchesKeyBinding(makeKeyEvent('Tab', { shiftKey: true }), 'Shift-Tab')).toBe(true)
  })
})

describe('defineEditorExtension', () => {
  it('merges options via .configure() and overrides commands/keymap via .extend()', () => {
    const base = defineEditorExtension<
      { defaultType: string; collapsible: boolean },
      { activeType: string },
      { log: string[] },
      { setCallout: (type?: string) => (ctx: { log: string[] }) => boolean }
    >({
      name: 'callout',
      kind: 'node',
      defaultOptions: () => ({ defaultType: 'info', collapsible: false }),
      createStorage: (opts) => ({ activeType: opts.defaultType }),
      commands: ({ options }) => ({
        setCallout:
          (type = options.defaultType) =>
          (ctx: { log: string[] }) => {
            ctx.log.push(`callout:${type}`)
            return true
          },
      }),
      keymap: () => ({
        'Mod-Shift-c': {
          id: 'callout.insert',
          key: 'Mod-Shift-c',
          label: 'Insert Callout',
          run: () => true,
        },
      }),
    })

    const configured = base.configure({ defaultType: 'warning' })
    expect(configured.options).toEqual({ defaultType: 'warning', collapsible: false })

    const extended = configured.extend({
      commands: (_ctx, parent) => ({
        setCallout: (type = 'error') => parent!.setCallout(type),
      }),
      keymap: (_ctx, parent) => ({
        ...parent,
        'Mod-Alt-c': {
          id: 'callout.alt',
          key: 'Mod-Alt-c',
          label: 'Alt Callout',
          run: () => true,
        },
      }),
    })

    const storage = extended.spec.createStorage!(extended.options)
    expect(storage).toEqual({ activeType: 'warning' })
    const commands = extended.spec.commands!({ options: extended.options, storage })
    const log: string[] = []
    expect(commands.setCallout()({ log })).toBe(true)
    expect(log).toEqual(['callout:error'])
    const keymap = extended.spec.keymap!({ options: extended.options, storage })
    expect(Object.keys(keymap)).toEqual(['Mod-Shift-c', 'Mod-Alt-c'])
  })
})

describe('DefaultEmbeddedEditorRegistry and format helpers', () => {
  it('registers, checks, creates, and unregisters embedded editor factories', () => {
    const registry = new DefaultEmbeddedEditorRegistry()
    const fakeEditor = { kind: 'dbmd', formats: ['dbmd'] } as unknown as Editor<{ sql: string }>
    const unregister = registry.register('dbmd', () => fakeEditor)

    expect(registry.supports('dbmd')).toBe(true)
    expect(
      registry.create({
        kind: 'dbmd',
        element: createFakeElement('host'),
        document: { sql: 'SELECT 1' },
      }),
    ).toBe(fakeEditor)

    unregister()
    expect(registry.supports('dbmd')).toBe(false)
    expect(() =>
      registry.create({
        kind: 'dbmd',
        element: createFakeElement('host'),
        document: { sql: 'SELECT 1' },
      }),
    ).toThrow(/No embedded editor factory registered/)
  })

  it('matches, strips, and checks untitled filenames for format extensions', () => {
    const formats = ['htmd', 'md'] as const
    expect(matchesFormatExtension('notes.htmd', formats)).toBe(true)
    expect(matchesFormatExtension('README.MD', formats)).toBe(true)
    expect(matchesFormatExtension('diagram.excalidraw', formats)).toBe(false)
    expect(stripFormatExtension('article.htmd', formats)).toBe('article')
    expect(stripFormatExtension('article.md', formats)).toBe('article')
    expect(isUntitledFormatFile('Untitled 2.htmd', formats)).toBe(true)
    expect(isUntitledFormatFile('Untitled.md', formats)).toBe(true)
    expect(isUntitledFormatFile('My Note.htmd', formats)).toBe(false)
  })
})
