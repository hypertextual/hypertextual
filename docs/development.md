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

## Lint, build, and integration tests

```sh
mise run //apps/hypertextual-svelte:lint
mise run //apps/hypertextual-svelte:build
mise run //apps/hypertextual-svelte:test
mise run //libs/ui:lint
mise run //libs/ui:build
mise run //libs/htmd-ts:build
mise run //libs/htmd-ts:lint
mise run //libs/htmd-ts:test
mise run //libs/htmd-ts:format:check
mise run //libs/hyped-fs:build
mise run //libs/hyped-fs:test
mise run //libs/hyped-fs:lint
mise run //libs/hyped-fs:format:check
mise run //apps/hypertextual-desktop:test
mise run //apps/hypertextual-desktop:lint
mise run //apps/hypertextual-desktop:build
mise run //apps/hypertextual-desktop:format:check
```

Run package commands separately. Do not start shared Bun install tasks in parallel. After dependencies are installed, add `--skip-deps` to Mise commands during iteration. Run Cargo tasks that share a target directory or lockfile sequentially.

HTMD parsing examples live in colocated `libs/htmd-ts/src/nodes.test.ts` and `marks.test.ts`, grouped by element and variant. Each BDD case shows source syntax and expected JSON. The Hypertextual workspace library runs the lifted native workspace, article, and media service cases under `libs/hyped-fs/tests`, with isolated temporary homes. App service integration cases remain in `apps/hypertextual-svelte/src/services`; view-model cases live beside their models in `src/models`. These packages do not have separate browser suites.

To run a task across projects, use `mise run --jobs 1 '//...:lint'` or replace `lint` with `build`, `test`, or `format:check`.

## Browser tests

```sh
mise run //e2e/hypertextual-desktop:install
mise run //e2e/hypertextual-desktop:smoke
mise run //e2e/hypertextual-desktop:test -- workspace-file-tree.spec.ts --project chromium
mise run //e2e/hypertextual-desktop:test -- editor.spec.ts --grep notice
mise run //e2e/hypertextual-desktop:test -- modal-editing.spec.ts
mise run //e2e/hypertextual-desktop:test
mise run //e2e/hypertextual-desktop:lint
```

Run relevant cases during development and the full suite before completing shared UI changes. Editor editability and scroll journeys live in `modal-editing.spec.ts`, grouped by the starting view or edit state and the user action. Each test owns a temporary workspace. The suite tests the production UI through a filesystem-backed Tauri substitute. The filesystem package integration suite and native app service tests cover native filesystem guarantees. The browser substitute does not test native windows or system Trash.

Open traces with `bunx playwright show-trace <trace.zip>`. Reports and traces remain under `e2e/hypertextual-desktop` and are ignored by Git.

## Further reading

- [Architecture](architecture/index.md)
- [UI library components](architecture/ui/index.md)
- [Svelte web app components](architecture/svelte-web-app/index.md)
- [Repository UI and testing rules](../AGENTS.md)
