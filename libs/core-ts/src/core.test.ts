import { describe, expect, it, mock } from 'bun:test'
import {
  createStandaloneHotkeyService,
  DefaultEmbeddedEditorRegistry,
  defineEditorExtension,
  isUntitledFormatFile,
  KeyScopeDispatcher,
  matchesFormatExtension,
  stripFormatExtension,
} from './index.js'
import type { Editor } from './types.js'

function createFakeElement(name: string, children: unknown[] = []) {
  const el = {
    name,
    children,
    contains(target: unknown): boolean {
      if (target === el) return true
      return children.some((child) => {
        if (child === target) return true
        const maybe = child as { contains?: (t: unknown) => boolean }
        return typeof maybe?.contains === 'function' ? maybe.contains(target) : false
      })
    },
  }
  return el as unknown as HTMLElement
}

function makeKeyEvent(
  key: string,
  options?: {
    target?: unknown
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
    target: options?.target ?? null,
    isComposing: false,
    preventDefault: mock(() => {}),
    stopPropagation: mock(() => {}),
  } as unknown as KeyboardEvent
}

// integration ---------------------------------------------------------------

describe('KeyScopeDispatcher and EmbeddedEditorRegistry integration', () => {
  it('routes keys to an embedded child editor before the parent editor and restores parent on exit', () => {
    const dispatcher = new KeyScopeDispatcher()
    const calls: string[] = []

    const childEl = createFakeElement('editor:dbmd')
    const parentEl = createFakeElement('editor:htmd', [childEl])
    let childFocused = true

    dispatcher.register({
      id: 'editor:htmd',
      priority: 'editor',
      element: () => parentEl,
      getContext: () => ({ id: 'parent' }),
      keymap: {
        Escape: {
          id: 'htmd.escape',
          key: 'Escape',
          label: 'Parent Escape',
          run: () => {
            calls.push('parent:Escape')
            return true
          },
        },
      },
    })

    dispatcher.register({
      id: 'editor:dbmd',
      priority: 'editor',
      element: () => childEl,
      enabled: () => childFocused,
      getContext: () => ({ id: 'child' }),
      keymap: {
        Escape: {
          id: 'dbmd.escape',
          key: 'Escape',
          label: 'Exit Child Editor',
          run: () => {
            calls.push('child:Escape')
            childFocused = false
            return true
          },
        },
      },
    })

    const firstEscape = makeKeyEvent('Escape', { target: childEl })
    expect(dispatcher.dispatch(firstEscape, 'normal')).toBe(true)
    expect(calls).toEqual(['child:Escape'])

    const secondEscape = makeKeyEvent('Escape', { target: parentEl })
    expect(dispatcher.dispatch(secondEscape, 'normal')).toBe(true)
    expect(calls).toEqual(['child:Escape', 'parent:Escape'])
  })
})

// unit ----------------------------------------------------------------------

describe('KeyScopeDispatcher', () => {
  it('evaluates scopes in strict priority order: overlay -> widget -> extension -> editor -> pane -> global', () => {
    const dispatcher = new KeyScopeDispatcher()
    const order: string[] = []

    for (const priority of [
      'global',
      'pane',
      'editor',
      'extension',
      'widget',
      'overlay',
    ] as const) {
      dispatcher.register({
        id: `scope:${priority}`,
        priority,
        getContext: () => priority,
        keymap: {
          Enter: {
            id: `${priority}.enter`,
            key: 'Enter',
            label: priority,
            run: (ctx) => {
              order.push(ctx)
              return false
            },
          },
        },
      })
    }

    dispatcher.dispatch(makeKeyEvent('Enter'), 'normal')
    expect(order).toEqual(['overlay', 'widget', 'extension', 'editor', 'pane', 'global'])
  })

  it('filters bindings by mode and when predicate', () => {
    const dispatcher = new KeyScopeDispatcher()
    const ran: string[] = []

    dispatcher.register({
      id: 'editor:htmd',
      priority: 'editor',
      getContext: () => ({ allowDelete: false }),
      keymap: {
        d: {
          id: 'delete',
          key: 'd',
          label: 'Delete',
          mode: 'normal',
          when: (ctx) => ctx.allowDelete,
          run: () => {
            ran.push('delete')
            return true
          },
        },
        i: {
          id: 'insert',
          key: 'i',
          label: 'Insert',
          mode: 'normal',
          run: () => {
            ran.push('insert')
            return true
          },
        },
      },
    })

    expect(dispatcher.dispatch(makeKeyEvent('d'), 'normal')).toBe(false)
    expect(dispatcher.dispatch(makeKeyEvent('i'), 'insert')).toBe(false)
    expect(dispatcher.dispatch(makeKeyEvent('i'), 'normal')).toBe(true)
    expect(ran).toEqual(['insert'])
  })

  it('supports Mod-key normalization for Meta and Control shortcuts', () => {
    const dispatcher = new KeyScopeDispatcher()
    let triggered = 0

    dispatcher.register({
      id: 'extension:bold',
      priority: 'extension',
      getContext: () => null,
      keymap: {
        'Mod-b': {
          id: 'bold.toggle',
          key: 'Mod-b',
          label: 'Toggle Bold',
          run: () => {
            triggered += 1
            return true
          },
        },
      },
    })

    expect(dispatcher.dispatch(makeKeyEvent('b', { metaKey: true }), 'insert')).toBe(true)
    expect(dispatcher.dispatch(makeKeyEvent('b', { ctrlKey: true }), 'insert')).toBe(true)
    expect(triggered).toBe(2)
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

  it('creates a standalone hotkey service that tracks mode, preset, and key scopes', () => {
    const service = createStandaloneHotkeyService({ initialMode: 'normal', initialPreset: 'helix' })
    const states: string[] = []
    service.subscribe((s) => states.push(`${s.mode}:${s.preset}`))

    service.setMode('insert')
    service.setPreset('vim')
    expect(service.getMode()).toBe('insert')
    expect(service.getPreset()).toBe('vim')
    expect(states).toEqual(['insert:helix', 'insert:vim'])
    service.destroy()
  })
})
