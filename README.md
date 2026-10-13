# Hypertextual

A Tauri + Svelte desktop app starter with a Rust CLI and internal HTMD libraries. This is a [Premise](https://github.com/cloudvoyant/premise) project.

## Stack

Tauri 2 / Svelte 5 / TypeScript / Vite 8 / Rust 2024 / Clap 4 / Bun / Mise / Premise

## Features

- Tauri desktop starter with an embedded Svelte frontend.
- Vite hot module replacement inside the desktop window.
- Rust CLI package `hypertextual`, with executable `hyped`.
- Internal Rust and TypeScript library starters for shared HTMD behavior.
- Private Svelte and TypeScript packages with npm publication disabled.
- Premise tasks for installation, development, builds, and checks.
- Native desktop installers for macOS, Linux, and Windows.

Document editing, HTMD processing, library integration, and MCP support remain future work.

## Quick start

Install [Mise](https://mise.jdx.dev/getting-started.html), [Premise](https://github.com/cloudvoyant/premise#readme), and the [Tauri native prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system, then run:

```bash
mise trust
pm install
pm run hypertextual-desktop:dev
```

## Docs

- [Development](docs/development.md): local setup, hot reload, builds, and checks.
- [Architecture](docs/architecture/index.md): project layout, component connections, and distribution.
- [Product requirements](prd/0001-hypertextual-app/README.md): planned application behavior.
- [Design prototype](designs/prototypes/hypertextual-v0/README.md): editor interactions and visual examples.

## License

License determination pending.
