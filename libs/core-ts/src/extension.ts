import type { Keymap } from './types.js'

export interface EditorExtensionSpec<
  TOptions = Record<string, never>,
  TStorage = Record<string, never>,
  TCtx = unknown,
  TCommands extends Record<string, (...args: never[]) => (ctx: TCtx) => boolean> = Record<
    string,
    never
  >,
> {
  name: string
  kind?: 'node' | 'mark' | 'behavior'
  priority?: number
  defaultOptions?: () => TOptions
  createStorage?: (options: TOptions) => TStorage
  commands?: (ctx: { options: TOptions; storage: TStorage }, parent?: TCommands) => TCommands
  keymap?: (ctx: { options: TOptions; storage: TStorage }, parent?: Keymap<TCtx>) => Keymap<TCtx>
  onCreate?: (ctx: { editor: TCtx; options: TOptions; storage: TStorage }) => void
  onDestroy?: (ctx: { options: TOptions; storage: TStorage }) => void
}

export interface EditorExtension<
  TOptions = Record<string, never>,
  TStorage = Record<string, never>,
  TCtx = unknown,
  TCommands extends Record<string, (...args: never[]) => (ctx: TCtx) => boolean> = Record<
    string,
    never
  >,
> {
  readonly spec: EditorExtensionSpec<TOptions, TStorage, TCtx, TCommands>
  readonly options: TOptions
  configure(options: Partial<TOptions>): EditorExtension<TOptions, TStorage, TCtx, TCommands>
  extend<
    TNextOptions extends TOptions = TOptions,
    TNextStorage extends TStorage = TStorage,
    TNextCommands extends Record<string, (...args: never[]) => (ctx: TCtx) => boolean> = TCommands,
  >(
    overrides: Partial<EditorExtensionSpec<TNextOptions, TNextStorage, TCtx, TNextCommands>>,
  ): EditorExtension<TNextOptions, TNextStorage, TCtx, TNextCommands>
}

function createExtensionInstance<
  TOptions,
  TStorage,
  TCtx,
  TCommands extends Record<string, (...args: never[]) => (ctx: TCtx) => boolean>,
>(
  spec: EditorExtensionSpec<TOptions, TStorage, TCtx, TCommands>,
  configuredOptions?: Partial<TOptions>,
): EditorExtension<TOptions, TStorage, TCtx, TCommands> {
  const baseOptions = spec.defaultOptions ? spec.defaultOptions() : ({} as TOptions)
  const mergedOptions = { ...baseOptions, ...(configuredOptions ?? {}) } as TOptions

  return {
    spec,
    options: mergedOptions,
    configure(nextOptions: Partial<TOptions>) {
      return createExtensionInstance(spec, { ...mergedOptions, ...nextOptions })
    },
    extend<
      TNextOptions extends TOptions = TOptions,
      TNextStorage extends TStorage = TStorage,
      TNextCommands extends Record<string, (...args: never[]) => (ctx: TCtx) => boolean> =
        TCommands,
    >(
      overrides: Partial<EditorExtensionSpec<TNextOptions, TNextStorage, TCtx, TNextCommands>>,
    ): EditorExtension<TNextOptions, TNextStorage, TCtx, TNextCommands> {
      const nextSpec: EditorExtensionSpec<TNextOptions, TNextStorage, TCtx, TNextCommands> = {
        ...(spec as unknown as EditorExtensionSpec<
          TNextOptions,
          TNextStorage,
          TCtx,
          TNextCommands
        >),
        ...overrides,
        defaultOptions: () => {
          const parentDefaults = spec.defaultOptions
            ? (spec.defaultOptions() as unknown as TNextOptions)
            : ({} as TNextOptions)
          const overrideDefaults = overrides.defaultOptions
            ? overrides.defaultOptions()
            : ({} as TNextOptions)
          return {
            ...parentDefaults,
            ...(mergedOptions as unknown as Partial<TNextOptions>),
            ...overrideDefaults,
          }
        },
        createStorage: (opts: TNextOptions) => {
          const parentStorage = spec.createStorage
            ? (spec.createStorage(opts) as unknown as TNextStorage)
            : ({} as TNextStorage)
          const overrideStorage = overrides.createStorage
            ? overrides.createStorage(opts)
            : ({} as TNextStorage)
          return { ...parentStorage, ...overrideStorage }
        },
        commands: (ctx) => {
          const parentCommands = spec.commands
            ? (spec.commands(
                ctx as unknown as { options: TOptions; storage: TStorage },
                {} as TCommands,
              ) as unknown as TNextCommands)
            : ({} as TNextCommands)
          const overrideCommands = overrides.commands
            ? overrides.commands(ctx, parentCommands)
            : ({} as TNextCommands)
          return { ...parentCommands, ...overrideCommands }
        },
        keymap: (ctx) => {
          const parentKeymap = spec.keymap
            ? spec.keymap(ctx as unknown as { options: TOptions; storage: TStorage }, {})
            : {}
          const overrideKeymap = overrides.keymap ? overrides.keymap(ctx, parentKeymap) : {}
          const optionKeymap = (ctx?.options as { keymap?: Keymap<TCtx> } | undefined)?.keymap ?? {}
          return { ...parentKeymap, ...overrideKeymap, ...optionKeymap }
        },
      }
      return createExtensionInstance(nextSpec)
    },
  }
}

export function defineEditorExtension<
  TOptions = Record<string, never>,
  TStorage = Record<string, never>,
  TCtx = unknown,
  TCommands extends Record<string, (...args: never[]) => (ctx: TCtx) => boolean> = Record<
    string,
    never
  >,
>(
  spec: EditorExtensionSpec<TOptions, TStorage, TCtx, TCommands>,
): EditorExtension<TOptions, TStorage, TCtx, TCommands> {
  return createExtensionInstance(spec)
}
