import type { Editor, EmbeddedEditorMountOptions, EmbeddedEditorRegistry } from './types.js'

export class DefaultEmbeddedEditorRegistry implements EmbeddedEditorRegistry {
  private factories = new Map<
    string,
    (options: EmbeddedEditorMountOptions<unknown>) => Editor<unknown>
  >()

  register<
    TDoc = unknown,
    TCommands extends Record<string, (...args: never[]) => boolean> = Record<
      string,
      (...args: never[]) => boolean
    >,
  >(
    kind: string,
    factory: (options: EmbeddedEditorMountOptions<TDoc>) => Editor<TDoc, TCommands>,
  ): () => void {
    this.factories.set(
      kind,
      factory as unknown as (options: EmbeddedEditorMountOptions<unknown>) => Editor<unknown>,
    )
    return () => {
      if (this.factories.get(kind) === (factory as unknown)) {
        this.factories.delete(kind)
      }
    }
  }

  create<TDoc = unknown>(options: EmbeddedEditorMountOptions<TDoc>): Editor<TDoc> {
    const factory = this.factories.get(options.kind)
    if (!factory) {
      throw new Error(`No embedded editor factory registered for kind "${options.kind}"`)
    }
    return factory(options as EmbeddedEditorMountOptions<unknown>) as Editor<TDoc>
  }

  supports(kind: string): boolean {
    return this.factories.has(kind)
  }
}

export function matchesFormatExtension(filename: string, formats: readonly string[]): boolean {
  const lower = filename.toLowerCase()
  return formats.some((fmt) => lower.endsWith(`.${fmt.toLowerCase()}`))
}

export function stripFormatExtension(filename: string, formats: readonly string[]): string {
  const lower = filename.toLowerCase()
  for (const fmt of formats) {
    const suffix = `.${fmt.toLowerCase()}`
    if (lower.endsWith(suffix)) {
      return filename.slice(0, -suffix.length)
    }
  }
  return filename
}

export function isUntitledFormatFile(filename: string, formats: readonly string[]): boolean {
  const stripped = stripFormatExtension(filename, formats).trim()
  if (stripped.length !== filename.trim().length) {
    return /^untitled(?:[ -]?\d+)?$/i.test(stripped)
  }
  return false
}
