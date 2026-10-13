# Development Guide

From clone to a running desktop app. This project uses [Premise](https://github.com/cloudvoyant/premise) for development tasks.

## 1. Clone + install

Install [Mise](https://mise.jdx.dev/getting-started.html), [Premise](https://github.com/cloudvoyant/premise#readme), and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system.

```sh
git clone https://github.com/hypertextual/hypertextual.git
cd hypertextual
```

If you are trying the unmerged scaffold, switch to its branch before installing dependencies:

```sh
git switch feature/scaffold
```

Install the workspace tools and dependencies:

```sh
mise trust
pm install
```

Bun installs shared frontend dependencies at the repository root. Premise also installs the declared tools and runs each Rust project's dependency-fetch task.

## 2. Local development

```sh
pm run hypertextual-desktop:dev
```

The desktop command starts Vite at `http://127.0.0.1:1420` and loads the Svelte app into the Tauri window. Hot module replacement applies Svelte edits without restarting Rust. Rust edits rebuild and restart the desktop process.

The Vite server requires port `1420`. If another process uses that port, stop that process before starting desktop development. The desktop command owns the frontend server, so do not start a second copy.

To work on the frontend in a browser, use:

```sh
pm run hypertextual-svelte:dev
```

The browser uses the same URL. Tauri APIs exist inside the desktop window only, so browser code needs separate handling for desktop operations.

## 3. CLI and libraries

```sh
pm run hypertextual:run
pm run htmd-rs:test
pm run htmd-ts:build
```

The CLI project is named `hypertextual`, while its binary is named `hyped`. It currently prints a starter greeting. The libraries contain starter behavior and are not integrated into the applications yet.

## 4. Builds

```sh
pm run hypertextual-desktop:build
pm run hypertextual-svelte:build
```

The desktop build compiles the Svelte app and embeds its `dist/` files. The desktop build task creates a debug executable without an installer. Bundled production apps need neither Bun, Node, nor a frontend development server at runtime.

Desktop tests and lint tasks build the frontend first because Tauri needs its assets during compilation. The Svelte app and TypeScript library share one dependency-install task to prevent concurrent Bun installs.

## 5. Checks

```sh
mise run --jobs 1 '//...:build'
mise run --jobs 1 '//...:test'
mise run --jobs 1 '//...:lint'
mise run --jobs 1 '//...:format:check'
```

These commands run one task at a time across the projects. To limit a check to one project, use `pm run <project>:<task>`, for example:

```sh
pm run hypertextual-svelte:lint
pm run hypertextual-desktop:test
```

## 6. Desktop distribution

Desktop installers contain the compiled frontend. The private Svelte package is not published to npm, and the HTMD libraries remain internal.

The macOS bundle uses ad-hoc signing, which seals the app without an Apple developer identity. Developer ID signing and notarization require separate credentials for trusted public distribution. See the [architecture guide](architecture/index.md#packaging-flow) for the component boundaries and packaging flow.
