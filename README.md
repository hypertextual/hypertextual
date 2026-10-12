# Hypertextual

Hypertextual is a desktop app, Svelte frontend, and Rust CLI with internal TypeScript and Rust libraries for HTMD documents. The projects currently contain starter code.

This is a [Premise](https://github.com/cloudvoyant/premise) project.

## Getting started

Install [Mise](https://mise.jdx.dev/getting-started.html) and [Premise](https://github.com/cloudvoyant/premise#readme). From the repository root, run:

```sh
mise trust
pm install
pm run hypertextual-desktop:dev
```

To run the CLI starter, use:

```sh
pm run hypertextual:run
```

Read the [development guide](docs/development.md) for hot reload and project-specific behavior, or the [architecture overview](docs/architecture/index.md) for the project layout. The [product requirements](prd/0001-hypertextual-app/README.md) and [design prototype](designs/prototypes/hypertextual-v0/README.md) describe the planned application.
