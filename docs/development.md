# Development guide

Install [Mise](https://mise.jdx.dev/getting-started.html), [Premise](https://github.com/cloudvoyant/premise#readme), and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system.

## Setup

```sh
git clone https://github.com/hypertextual/hypertextual.git
cd hypertextual
mise trust
pm install
```

## Run

```sh
pm run hypertextual-desktop:dev
pm run hypertextual-svelte:dev
pm run hypertextual:run
```

Run one frontend server at a time. Desktop development starts its own server on port `1420`. The browser frontend needs Tauri for local workspace access.

## Lint, build, and unit tests

```sh
mise run //apps/hypertextual-svelte:lint
mise run //apps/hypertextual-svelte:build
mise run //apps/hypertextual-svelte:test
mise run //libs/ui:lint
mise run //libs/ui:build
mise run //libs/ui:test
mise run //apps/hypertextual-desktop:test
```

To run a task across projects, use `mise run --jobs 1 '//...:lint'` or replace `lint` with `build`, `test`, or `format:check`.

## Browser tests

```sh
mise run //e2e/hypertextual-desktop:install
mise run //e2e/hypertextual-desktop:smoke
mise run //e2e/hypertextual-desktop:test -- workspace-file-tree.spec.ts --project chromium
mise run //e2e/hypertextual-desktop:test -- editor.spec.ts --grep notice
mise run //e2e/hypertextual-desktop:test
mise run //e2e/hypertextual-desktop:lint
```

Run relevant cases during development and the full suite before completing shared UI changes. Each test owns a temporary workspace. The suite tests the production UI through a filesystem-backed Tauri substitute. Rust behavior tests cover native filesystem guarantees.

Open traces with `bunx playwright show-trace <trace.zip>`. Reports and traces remain under `e2e/hypertextual-desktop` and are ignored by Git.

## Further reading

- [Architecture](architecture/index.md)
- [UI library components](architecture/ui/index.md)
- [Svelte web app components](architecture/svelte-web-app/index.md)
- [Repository UI and testing rules](../AGENTS.md)
