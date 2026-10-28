# Hypertextual UI

Private Svelte components and a native JSON editor built on published Helical packages and Ark UI.

## Features

- Vendored Svelte editor and framework-neutral Tiptap core.
- Reusable tree view and context menu with Helical styles.
- Native ProseMirror JSON contracts with app-owned storage and conversion.

## Quick start

From the repository root, run:

```sh
mise run //libs/ui:lint
mise run //libs/ui:build
```

## Docs

- [Component architecture](../../docs/architecture/ui/index.md): tree view, context menu, and editor contracts.
- [Editor source ownership](../../docs/architecture/ui/editor-source.md): upstream provenance and the transplant path.
- [Development](../../docs/development.md): setup, commands, and browser tests.

## License

License determination pending. The editor source guide records upstream license provenance.
