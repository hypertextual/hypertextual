# hyped-fs

Private Rust library for Hypertextual workspace models and local persistence services.

## Features

- Workspace browsing and file and folder operations.
- Article saves with revision checks and title-derived filenames.
- Portable image assets and workspace containment.

## Quick start

From the repository root, run:

```sh
mise run //libs/hyped-fs:build
mise run //libs/hyped-fs:test
```

## Docs

- [Architecture and public API](../../docs/architecture/hyped-fs.md): services, models, save flow, and storage guarantees.
- [Development](../../docs/development.md): setup, commands, and native integration tests.
- [System architecture](../../docs/architecture/index.md): desktop adapters and app orchestration.

## License

The package manifest declares MIT.
