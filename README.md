# Hypertextual

Hypertextual is a workspace for a desktop app, two internal libraries, and a Rust CLI.
The projects contain starter code only.
The editor, HTMD format, and library integration remain future work.

| Path                        | Project                                       |
| --------------------------- | --------------------------------------------- |
| `apps/hypertextual-desktop` | Tauri desktop app with a placeholder frontend |
| `libs/htmd-ts`              | Internal TypeScript library managed with Bun  |
| `libs/htmd-rs`              | Internal Rust library                         |
| `apps/hyped`                | Rust CLI built with Clap                      |

Premise manages project creation and development tasks.
Mise installs the tools and runs those tasks.
The `premise.yaml` file records each project and its template source.
The libraries do not publish to package registries.
The CLI package is named `hypertextual`, and its installed binary is named `hyped`.

Install Mise and Premise before you run these commands.
From the repository root, trust the project configuration and install dependencies:

```sh
mise trust
pm install
```

Run a task for one project:

```sh
pm run hypertextual-desktop:dev
pm run hypertextual:run
pm run htmd-ts:build
pm run htmd-rs:test
```

Run checks across all projects:

```sh
mise run --jobs 1 '//...:build'
mise run --jobs 1 '//...:test'
mise run --jobs 1 '//...:lint'
mise run --jobs 1 '//...:format:check'
```

The desktop build needs the native Tauri dependencies for your operating system.
This scaffold uses the local `~/Projects/premise-bun` and `~/Projects/premise-cargo` registries.
Those paths record where the starter projects came from.
Normal development uses the generated files in this repository.

See [the product requirements](prd/0001-hypertextual-app/README.md) and [the design prototype](designs/prototypes/hypertextual-v0/README.md) for the planned application.
