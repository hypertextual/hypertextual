# HTMD TypeScript

Private SDK for the HTMD Markdown format and synchronous conversion between file contents and native ProseMirror JSON.

## Features

- CommonMark and GFM with custom component syntax.
- Complete parsing and save/reopen conversion for supported editor elements.
- Per-fragment recovery with preserved source and issue metadata.

## Quick start

From the repository root, run:

```sh
mise run //libs/htmd-ts:build
mise run //libs/htmd-ts:test
```

## Docs

- [Architecture and public API](../../docs/architecture/htmd-ts/index.md): package boundaries, Markdown syntax, conversion, and recovery.
- [Editor extensions and ProseMirror/Tiptap architecture](../../docs/architecture/htmd-ts/editor-extensions.md): extension compiler, Svelte NodeViews, and modal editing.
- [Development](../../docs/development.md): setup, commands, and test suites.
- [System architecture](../../docs/architecture/index.md): app orchestration and package relationships.

## License

License determination pending.
