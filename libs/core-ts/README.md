# Core TypeScript (`core-ts`)

Engine- and framework-neutral TypeScript contracts for Hypertextual editor plugins, extensions, hierarchical key scopes, and host services.

## Features

- Abstract `Editor`, `EditorFormatAdapter`, and `EditorDocument` contracts for multi-format editors.
- `defineEditorExtension` builder for options, storage, commands, and scoped keymaps.
- `KeyBinding`, `Keymap`, and `KeyScopeOptions` contracts with priority ordering (`overlay` -> `widget` -> `extension` -> `editor` -> `pane` -> `global`) and `matchesKeyBinding`.
- `EditorHostServices` for hotkeys, notifications, media reading/writing, and recursive editor embedding.

## Quick start

From the repository root, run:

```sh
mise run //libs/core-ts:build
mise run //libs/core-ts:test
```

## Docs

- [Architecture and public API](../../docs/architecture/core-ts.md)
- [Development](../../docs/development.md)
- [System architecture](../../docs/architecture/index.md)

## License

License determination pending.
